import { EventEmitter } from 'events'
import * as crypto from './crypto'
import { API } from './api'
import { streamToCb } from './util.js'
import request from 'request'
import CombinedStream from 'combined-stream'

const api = new API(false)

export { File }
class File extends EventEmitter {
  constructor (opt, storage) {
    super()
    this.downloadId = opt.downloadId
    this.key = opt.key ? crypto.formatKey(opt.key) : null

    if (storage && opt.h) {
      this.api = storage.api
      this.nodeId = opt.h
      this.timestamp = opt.ts
      this.type = opt.t
      this.directory = !!this.type

      if (opt.k) {
        this._decryptAttributes(storage.aes, opt)
      }
    } else {
      this.type = opt.directory ? 1 : 0
      this.directory = !!opt.directory
    }
  }

  _decryptAttributes (aes, opt) {
    this.size = opt.s || 0
    this.timestamp = opt.ts || 0
    this.type = opt.t
    this.name = null

    if (!aes || !opt.k) return

    const parts = opt.k.split(':')
    this.key = crypto.formatKey(parts[parts.length - 1])
    aes.decryptKey(this.key)
    if (opt.a) {
      this._setAttributes(opt.a)
    }
  }

  _setAttributes (at, cb = () => {}) {
    at = crypto.d64(at)
    crypto.getCipher(this.key).decryptCBC(at)

    try {
      at = File.unpackAttributes(at)
    } catch (e) {
      return cb(e)
    }

    this.attributes = at
    this.name = at.n

    cb(null, this)

    return this
  }

  loadAttributes (cb) {
    const req = this.directory
    ? {a: 'f', qs: {n: this.downloadId}}
    : {a: 'g', p: this.downloadId} // todo: nodeId version ('n')
    api.request(req, (err, response) => {
      if (err) return cb(err)

      if (this.directory) {
        const filesMap = new Map()
        const folder = response.f[0]
        const aes = this.key ? new crypto.AES(this.key) : null
        this.nodeId = folder.h
        this.timestamp = folder.ts
        filesMap.set(folder.h, this)

        for (let file of response.f) {
          if (file.t === 0) {
            const parent = filesMap.get(file.p)
            if (!parent.children) parent.children = []

            const fileObj = new File(file, this.storage)
            fileObj._decryptAttributes(aes, file)
            // is it the best way to handle this?
            fileObj.downloadId = [this.downloadId, file.h]
            parent.children.push(fileObj)
            file.parent = parent
          }
        }

        this._decryptAttributes(aes, folder)
        cb(null, this)
      } else {
        this.size = response.s
        this._setAttributes(response.at, cb)
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
      req.qs = {n: this.downloadId[0]}
      req.n = this.downloadId[1]
    } else {
      req.p = this.downloadId
    }

    if (this.directory) throw Error("Can't download: folder download isn't supported")
    if (!this.key) throw Error("Can't download: key isn't defined")
    const stream = crypto.megaDecrypt(this.key)

    const cs = this.api || api
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
        const r = request(response.g + '/' + currentOffset + '-' + (currentMax - 1))

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

  delete (cb) {
    if (!this.nodeId) {
      return process.nextTick(() => {
        cb(new Error('delete is only supported on files with node ID-s'))
      })
    }
    this.api.request({a: 'd', n: this.nodeId}, cb)

    return this
  }

  link (noKey, cb) {
    if (arguments.length === 1 && typeof noKey === 'function') {
      cb = noKey
      noKey = false
    }
    if (!this.nodeId) {
      return process.nextTick(() => {
        cb(new Error('delete is only supported on files with node ID-s'))
      })
    }
    this.api.request({a: 'l', n: this.nodeId}, (err, id) => {
      if (err) return cb(err)
      let url = `https://mega.nz/#!${id}`
      if (!noKey && this.key) url += `!${crypto.e64(this.key)}`
      cb(null, url)
    })

    return this
  }
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
