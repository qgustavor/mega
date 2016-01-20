import {EventEmitter} from 'events'
import * as crypto from './crypto'
import {API} from './api'
import mega from './mega'
import {streamToCb} from './util.js'
import streamRequest from './streamRequest'
import CombinedStream from 'combined-stream'
// import pause from 'pause-stream'

const api = new API(false)

export {File}

class File extends EventEmitter {
  constructor(opt, storage) {
    super()
    this.downloadId = opt.downloadId
    this.key = crypto.formatKey(opt.key)
    if (storage && opt.h) {
      this.api = storage.api
      this.nodeId = opt.h
      this.timestamp = opt.ts
      this.type = opt.t
      this.directory = !!this.type

      if (opt.k) {
        const parts = opt.k.split(':');
        this.key = crypto.formatKey(parts[parts.length-1])
        storage.aes.decryptKey(this.key)
        this.size = opt.s || 0
        if (opt.a) {
          this._setAttributes(opt.a, () => {})
        } else {
          this.name = ''
        }
      }
    }
  }

  _setAttributes(at, cb) {
    at = crypto.d64(at)
    File.getCipher(this.key).decryptCBC(at)

    try {
      at = File.unpackAttributes(at)
    } catch (e) {
      return cb(e)
    }

    this.attributes = at
    this.name = at.n

    cb(null, this)
  }

  loadAttributes(cb) {
    const req = {a: 'g', p: this.downloadId}; // todo: nodeId version ('n')
    const self = this;
    api.request(req, (err, response) => {
      if (err) return cb(err)

      self.size = response.s
      self._setAttributes(response.at, cb)
    })
  }

  download(cb) {
    const req = {a: 'g', g: 1, ssl: 2};
    if (this.nodeId) {
      req.n = this.nodeId
    } else {
      req.p = this.downloadId
    }

    const stream = mega.decrypt(this.key);

    const cs = this.api || api;
    cs.request(req, (err, response) => {
      if (err) return stream.emit('error', err)

      let activeStreams = 0
      let currentOffset = 0
      let chunkSize = 128 * 1024
      let combined = CombinedStream.create()
      
      function getChunk() {
        const currentMax = Math.min(response.s, currentOffset + chunkSize)
        if (currentMax <= currentOffset) return;
        const r = streamRequest(response.g + '/' + currentOffset + '-' + (currentMax - 1))
        
        r.on('end', getChunk);
        combined.append(r, {contentLength: currentMax - currentOffset});
        
        currentOffset = currentMax
        chunkSize = Math.max(chunkSize + 128 * 1024, 1024 * 1024)
        
        if (++activeStreams < 4) {
          setTimeout(getChunk, 1000)
        }
      }
      
      getChunk()
      combined.pipe(stream)
      
      let i = 0;
      stream.on('data', d => {
        i += d.length
        stream.emit('progress', {bytesLoaded: i, bytesTotal: response.s})
      })
    })

    if (cb) streamToCb(stream, cb)
    return stream
  }

  delete(cb) {
    if (!this.nodeId) {
      return process.nextTick(() => {
        cb(new Error('delete is only supported on files with node ID-s'))
      })
    }
    this.api.request({a: 'd', n: this.nodeId}, cb)
  }

  link(noKey, cb) {
    if (arguments.length === 1 && typeof noKey === 'function') {
      cb = noKey
      noKey = false
    }
    if (!this.nodeId) {
      return process.nextTick(() => {
        cb(new Error('delete is only supported on files with node ID-s'))
      })
    }
    const self = this;
    this.api.request({a: 'l', n: this.nodeId}, (err, id) => {
      if (err) return cb(err)
      let url = `https://mega.nz/#!${id}`;
      if (!noKey) url += `!${crypto.e64(self.key)}`
      cb(null, url)
    })
  }
}

File.getCipher = function(key) {
  // 256 -> 128
  const k = new Buffer(16);
  for (let i = 0; i < 16; i++) {
    k.writeUInt8(key.readUInt8(i) ^ key.readUInt8(i + 16, true), i)
  }
  return new crypto.AES(k)
}

File.packAttributes = function(attributes) {
  let at = JSON.stringify(attributes);
  at = new Buffer(`MEGA${at}`)
  const ret = new Buffer(Math.ceil(at.length/16) * 16);
  ret.fill(0)
  at.copy(ret)
  return ret
}

File.unpackAttributes = function(at) {
  // remove empty bytes from end
  let end = at.length;
  while (!at.readUInt8(end - 1)) end--

  at = at.slice(0, end).toString()
  if (at.substr(0, 6) !== 'MEGA{"') {
    throw new Error('Attributes could not be decrypted with provided key.')
  }

  return JSON.parse(at.substr(4).replace(/\0|[^}]*$/g, ''));
}