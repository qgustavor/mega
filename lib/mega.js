import { parse } from 'url'
import through from 'through'
import pipeline from 'stream-combiner'

import * as crypto from './crypto'
import { chunkSizeSafe } from './util.js'

function mega (...args) {
  return new mega.Storage(...args)
}

export default mega

mega.file = function (opt) {
  if (typeof opt === 'string') {
    var url = parse(opt)

    var split = url.hash.split('!')
    if ((url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') ||
      !url.hash || split.length !== 3) {
      throw Error('Wrong URL supplied')
    }
    opt = {downloadId: split[1], key: split[2]}
  }
  return new mega.File(opt)
}

mega.encrypt = function (key) {
  key = crypto.formatKey(key)

  if (!key) {
    throw Error('key not defined')
  }
  if (!(key instanceof Buffer)) {
    key = new Buffer(key)
  }

  var stream = through(write, end)

  if (key.length !== 24) {
    return process.nextTick(function () {
      stream.emit('error', new Error('Wrong key length. Key must be 192bit.'))
    })
  }

  var aes = new crypto.AES(key.slice(0, 16))
  var ctr = new crypto.CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)])

  function write (d) {
    ctr.encrypt(d)
    this.emit('data', d)
  }

  function end () {
    var mac = ctr.condensedMac()
    var newkey = new Buffer(32)
    key.copy(newkey)
    newkey.writeInt32BE(mac[0] ^ mac[1], 24)
    newkey.writeInt32BE(mac[2] ^ mac[3], 28)
    for (var i = 0; i < 16; i++) {
      newkey.writeUInt8(newkey.readUInt8(i) ^ newkey.readUInt8(16 + i), i)
    }
    stream.key = newkey
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

mega.decrypt = function (key) {
  key = crypto.formatKey(key)

  var stream = through(write, end)

  var aes = mega.File.getCipher(key)
  var ctr = new crypto.CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)])

  function write (d) {
    ctr.decrypt(d)
    this.emit('data', d)
  }

  function end () {
    var mac = ctr.condensedMac()
    if ((mac[0] ^ mac[1]) !== key.readInt32BE(24) || (mac[2] ^ mac[3]) !== key.readInt32BE(28)) {
      return this.emit('error', new Error('MAC verification failed'))
    }
    this.emit('end')
  }

  return pipeline(chunkSizeSafe(16), stream)
}

import { Storage } from './storage'
mega.Storage = Storage

import { File } from './file'
mega.File = File
