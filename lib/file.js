import { d64, AES, formatKey, getCipher, megaDecrypt } from './crypto'
import CombinedStream from 'combined-stream'
import { API } from './api'
import { EventEmitter } from 'events'
import { parse } from 'url'
import { streamToCb } from './util'

const notLoggedApi = new API(false)

class File extends EventEmitter {
  constructor (opt) {
    super()
    this.downloadId = opt.downloadId
    this.key = opt.key ? formatKey(opt.key) : null
    this.type = opt.directory ? 1 : 0
    this.directory = !!opt.directory
    this.api = notLoggedApi
  }

  loadMetadata (aes, opt) {
    this.size = opt.s || 0
    this.timestamp = opt.ts || 0
    this.type = opt.t
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
    ? {a: 'f', qs: {n: this.downloadId}}
    : {a: 'g', p: this.downloadId} // todo: nodeId version ('n')

    this.api.request(req, (err, response) => {
      if (err) return cb(err)

      if (this.directory) {
        const filesMap = new Map()
        const folder = response.f[0]
        const aes = this.key ? new AES(this.key) : null
        this.nodeId = folder.h
        this.timestamp = folder.ts
        filesMap.set(folder.h, this)

        for (let file of response.f) {
          if (file.t === 0) {
            const parent = filesMap.get(file.p)
            if (!parent.children) parent.children = []

            const fileObj = new File(file, this.storage)
            fileObj.loadMetadata(aes, file)
            // is it the best way to handle this?
            fileObj.downloadId = [this.downloadId, file.h]
            parent.children.push(fileObj)
            file.parent = parent
          }
        }

        this.loadMetadata(aes, folder)
        cb(null, this)
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
    const maxConnections = options.maxConnections || 4
    const initialChunkSize = options.initialChunkSize || 128 * 1024
    const chunkSizeIncrement = options.chunkSizeIncrement || 128 * 1024
    const maxChunkSize = options.maxChunkSize || 1024 * 1024

    const req = {a: 'g', g: 1, ssl: 2}
    if (this.nodeId) {
      req.n = this.nodeId
    } else if (Array.isArray(this.downloadId)) {
      req._querystring = {n: this.downloadId[0]}
      req.n = this.downloadId[1]
    } else {
      req.p = this.downloadId
    }

    if (this.directory) throw Error("Can't download: folder download isn't supported")
    if (!this.key) throw Error("Can't download: key isn't defined")
    const stream = megaDecrypt(this.key)

    const cs = this.api || notLoggedApi
    const requestModule = options.requestModule || this.api.requestModule

    cs.request(req, (err, response) => {
      if (err) return stream.emit('error', err)
      if (typeof response.g !== 'string' || response.g.substr(0, 4) !== 'http') {
        return stream.emit('error', Error('MEGA servers returned an invalid response, maybe caused by rate limit'))
      }

      let activeStreams = 0
      let currentOffset = 0
      let chunkSize = initialChunkSize
      let combined = CombinedStream.create()

      function getChunk () {
        const currentMax = Math.min(response.s, currentOffset + chunkSize)
        if (currentMax <= currentOffset) return
        const r = requestModule(response.g + '/' + currentOffset + '-' + (currentMax - 1))

        r.on('end', getChunk)
        combined.append(r, {contentLength: currentMax - currentOffset})

        currentOffset = currentMax
        if (chunkSize < maxChunkSize) {
          chunkSize = chunkSize + chunkSizeIncrement
        }

        activeStreams += 1
        if (activeStreams < maxConnections) {
          setTimeout(getChunk, 1000)
        }
      }

      getChunk()
      combined.pipe(stream)

      let i = 0
      stream.on('data', d => {
        i += d.length
        stream.emit('progress', {bytesLoaded: i, bytesTotal: response.s})
      })
    })

    if (cb) streamToCb(stream, cb)
    return stream
  }
}

File.LABEL_NAMES = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey']

File.fromURL = (opt) => {
  if (typeof opt === 'object') {
    // todo: warn to use File directly
    return new File(opt)
  }

  const url = parse(opt)
  if (url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') throw Error('Wrong URL supplied: wrong hostname')
  if (!url.hash) throw Error('Wrong URL supplied: no hash')

  const split = url.hash.split('!')
  if (split.length <= 1) throw Error('Wrong URL supplied: too few arguments')
  if (split.length >= 4) throw Error('Wrong URL supplied: too many arguments')
  if (split[0] !== '#' && split[0] !== '#F') throw Error('Wrong URL supplied: not recognized')

  return new File({
    downloadId: split[1],
    key: split[2],
    directory: split[0] === '#F'
  })
}

File.packAttributes = function (attributes) {
  let at = JSON.stringify(attributes)
  at = new Buffer(`MEGA${at}`)
  const ret = new Buffer(Math.ceil(at.length / 16) * 16)
  ret.fill(0)
  at.copy(ret)
  return ret
}

File.unpackAttributes = function (at) {
  // read until the first null byte
  let end = 0
  while (end < at.length && at.readUInt8(end)) end++

  at = at.slice(0, end).toString()
  if (at.substr(0, 6) !== 'MEGA{"') {
    throw new Error('Attributes could not be decrypted with provided key.')
  }

  return JSON.parse(at.substr(4).replace(/\0|[^}]*$/g, ''))
}

export default File
