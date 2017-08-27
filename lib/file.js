/* global IS_BROWSER_BUILD */
import { e64, d64, AES, formatKey, getCipher, megaDecrypt } from './crypto'
import CombinedStream from 'combined-stream'
import { API } from './api'
import { EventEmitter } from 'events'
import { parse } from 'url'
import { streamToCb } from './util'
import { PassThrough } from 'stream'
import StreamSkip from 'stream-skip'

const notLoggedApi = new API(false)

class File extends EventEmitter {
  constructor (opt) {
    super()
    this.checkConstructorArgument(opt.downloadId)
    this.checkConstructorArgument(opt.key)
    this.checkConstructorArgument(opt.loadedFile)

    this.downloadId = opt.downloadId
    this.key = opt.key ? formatKey(opt.key) : null
    this.type = opt.directory ? 1 : 0
    this.directory = !!opt.directory
    this.api = notLoggedApi
    this.loadedFile = opt.loadedFile
  }

  checkConstructorArgument (value) {
    // If a string was passed then check if it's not empty and
    // contains only base64 valid characters
    if (typeof value === 'string' && !/^[\w-]+$/.test(value)) {
      throw Error(`Invalid argument: "${value}"`)
    }
  }

  loadMetadata (aes, opt) {
    this.size = opt.s || 0
    this.timestamp = opt.ts || 0
    this.type = opt.t
    this.directory = !!opt.t
    this.owner = opt.u
    this.name = null

    if (!aes || !opt.k) return

    const parts = opt.k.split(':')
    this.key = formatKey(parts[parts.length - 1])
    aes.decryptECB(this.key)

    if (opt.a) {
      this.decryptAttributes(opt.a)
    }
  }

  decryptAttributes (at, cb = () => {}) {
    at = d64(at)
    getCipher(this.key).decryptCBC(at)

    try {
      at = File.unpackAttributes(at)
    } catch (e) {
      return cb(e)
    }

    this.parseAttributes(at)
    cb(null, this)
    return this
  }

  parseAttributes (at) {
    this.attributes = at
    this.name = at.n
    this.label = File.LABEL_NAMES[at.lbl || 0]
    this.favorited = !!at.fav
  }

  loadAttributes (cb) {
    if (typeof cb !== 'function') {
      cb = err => {
        if (err) throw err
      }
    }

    const req = this.directory
    ? {a: 'f', c: 1, ca: 1, r: 1, _querystring: {n: this.downloadId}}
    : {a: 'g', p: this.downloadId} // todo: nodeId version ('n')

    this.api.request(req, (err, response) => {
      if (err) return cb(err)

      if (this.directory) {
        const filesMap = {}
        const nodes = response.f
        const folder = nodes.find(node => node.k &&
          // the root folder is the one which "n" equals the first part of "k"
          node.h === node.k.split(':')[0]
        )
        const aes = this.key ? new AES(this.key) : null
        this.nodeId = folder.h
        this.timestamp = folder.ts
        filesMap[folder.h] = this

        // sort folders before files to reduce tree organization loops
        nodes.sort((a, b) => {
          return b.t - a.t
        })

        let tries = 0
        do {
          for (let i = 0; i < nodes.length; i++) {
            const file = nodes[i]
            if (file === folder) {
              nodes.splice(i, 1)
              continue
            }

            const parent = filesMap[file.p]
            if (!parent) continue

            // Remove file and reset tries
            nodes.splice(i, 1)
            tries = 0

            if (!parent.children) parent.children = []

            const fileObj = new File(file, this.storage)
            fileObj.loadMetadata(aes, file)

            // is it the best way to handle this?
            fileObj.downloadId = [this.downloadId, file.h]
            parent.children.push(fileObj)
            file.parent = parent
            filesMap[file.h] = fileObj
          }
        } while (nodes.length > 0 && tries++ < 3)

        this.loadMetadata(aes, folder)

        cb(null, this.loadedFile
          ? filesMap[this.loadedFile]
          : this)
      } else {
        this.size = response.s
        this.decryptAttributes(response.at, cb)
      }
    })

    return this
  }

  download (options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = {}
    }

    if (!options) options = {}
    const start = options.start || 0
    const apiStart = options.returnCiphertext ? start : start - start % 16
    let end = options.end || null

    const maxConnections = options.maxConnections || 4
    const initialChunkSize = options.initialChunkSize || 128 * 1024
    const chunkSizeIncrement = options.chunkSizeIncrement || 128 * 1024
    const maxChunkSize = options.maxChunkSize || 1024 * 1024

    const req = {a: 'g', g: 1, ssl: IS_BROWSER_BUILD ? 2 : 0}
    if (this.nodeId) {
      req.n = this.nodeId
    } else if (Array.isArray(this.downloadId)) {
      req._querystring = {n: this.downloadId[0]}
      req.n = this.downloadId[1]
    } else {
      req.p = this.downloadId
    }

    if (this.directory) throw Error("Can't download: folder download isn't supported")

    // If options.returnCiphertext is true then the ciphertext is returned.
    // The result can be decrypted later using mega.decrypt() stream
    if (!this.key && !options.returnCiphertext) throw Error("Can't download: key isn't defined")

    const decryptStream = this.key && !options.returnCiphertext
      ? megaDecrypt(this.key, {
        start: apiStart,
        disableVerification: apiStart !== 0 || end !== null
      })
      : new PassThrough()

    const stream = apiStart === start
      ? decryptStream
      : decryptStream.pipe(new StreamSkip({
        skip: start - apiStart
      }))

    const cs = this.api || notLoggedApi
    const requestModule = options.requestModule || this.api.requestModule
    let gotError = false

    cs.request(req, (err, response) => {
      if (err) return stream.emit('error', err)
      if (typeof response.g !== 'string' || response.g.substr(0, 4) !== 'http') {
        return stream.emit('error', Error('MEGA servers returned an invalid response, maybe caused by rate limit'))
      }

      if (!end) end = response.s
      if (start > end) return stream.emit('error', Error("You can't download past the end of the file."))

      let activeStreams = 0
      let currentOffset = apiStart
      let chunkSize = initialChunkSize
      let combined

      function handleErrors (resp) {
        if (resp.statusCode === 200) return
        stream.emit('error', resp.statusCode === 509
        ? Error('Bandwidth limit reached: ' + resp.headers['x-mega-time-left'] + ' seconds until it resets')
        : Error('MEGA returned a ' + resp.statusCode + ' status code'))
        gotError = true
      }

      function getChunk () {
        if (gotError) return
        const currentMax = Math.min(end, currentOffset + chunkSize)
        if (currentMax <= currentOffset) return
        const r = requestModule(response.g + '/' + currentOffset + '-' + (currentMax - 1))

        r.on('end', getChunk)
        r.on('error', getChunk)
        r.on('response', handleErrors)

        combined.append(r)

        currentOffset = currentMax
        if (chunkSize < maxChunkSize) {
          chunkSize = chunkSize + chunkSizeIncrement
        }

        activeStreams += 1
        if (activeStreams < maxConnections) {
          setTimeout(getChunk, 1000)
        }
      }

      if (maxConnections === 1) {
        const r = requestModule(response.g + '/' + apiStart + '-' + (end - 1))
        r.on('error', handleErrors)
        r.pipe(decryptStream)
      } else {
        combined = CombinedStream.create()

        // Pass errors from the combined stream to the main stream
        combined.on('error', (err) => stream.emit('error', err))

        getChunk()
        combined.pipe(decryptStream)
      }

      let i = 0
      stream.on('data', d => {
        i += d.length
        stream.emit('progress', {bytesLoaded: i, bytesTotal: response.s})
      })
    })

    if (cb) streamToCb(stream, cb)
    return stream
  }

  link (options, cb) {
    if (arguments.length === 1 && typeof options === 'function') {
      cb = options
      options = {
        noKey: false
      }
    }

    if (typeof options === 'boolean') {
      options = {
        noKey: options
      }
    }

    let url = `https://mega.nz/#${this.directory ? 'F' : ''}!${this.downloadId}`
    if (!options.noKey && this.key) url += `!${e64(this.key)}`
    if (!options.noKey && this.loadedFile) url += `!${this.loadedFile}`

    cb(null, url)
  }
}

File.LABEL_NAMES = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey']

File.fromURL = (opt) => {
  if (typeof opt === 'object') {
    // todo: warn to use File directly
    return new File(opt)
  }

  // Supported formats:
  // https://mega.nz/#!file_handker
  // https://mega.nz/#!file_handker!file_key
  // https://mega.nz/#F!folder_handker
  // https://mega.nz/#F!folder_handker!folder_key
  // https://mega.nz/#F!folder_handker!folder_key!file_handle

  const url = parse(opt)
  if (url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') throw Error('Invalid URL: wrong hostname')
  if (!url.hash) throw Error('Invalid URL: no hash')

  const split = url.hash.split('!')
  if (split[0] !== '#' && split[0] !== '#F') throw Error('Invalid URL: format not recognized')
  if (split.length <= 1) throw Error('Invalid URL: too few arguments')
  if (split.length >= (split[0] === '#' ? 4 : 5)) throw Error('Invalid URL: too many arguments')

  return new File({
    downloadId: split[1],
    key: split[2],
    directory: split[0] === '#F',
    loadedFile: split[3]
  })
}

File.unpackAttributes = (at) => {
  // read until the first null byte
  let end = 0
  while (end < at.length && at.readUInt8(end)) end++

  at = at.slice(0, end).toString()
  if (at.substr(0, 6) !== 'MEGA{"') {
    throw Error('Attributes could not be decrypted with provided key.')
  }

  return JSON.parse(at.substr(4).replace(/\0|[^}]*$/g, ''))
}

export default File
