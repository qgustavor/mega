import through from 'through'
import pipeline from 'stream-combiner'
import { chunkSizeSafe } from '../util.js'
import secureRandom from 'secure-random'
import { AES, CTR, prepareKey } from './aes'

export { AES, CTR, prepareKey }

export function formatKey (key) {
  return typeof key === 'string' ? d64(key) : key
}

// URL Safe Base64 encode/decode
function e64 (buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function d64 (s) {
  s += '=='.substr((2 - s.length * 3) & 3)
  s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, '')
  return new Buffer(s, 'base64')
}
export { e64, d64 }

export function getCipher (key) {
  // 256 -> 128
  const k = new Buffer(16)
  for (let i = 0; i < 16; i++) {
    k.writeUInt8(key.readUInt8(i) ^ key.readUInt8(i + 16, true), i)
  }
  return new AES(k)
}

function megaEncrypt (key, options) {
  if (!options) options = {}
  key = formatKey(key)

  if (!key) {
    key = secureRandom(24)
  }
  if (!(key instanceof Buffer)) {
    key = new Buffer(key)
  }

  let stream = through(write, end)

  if (key.length !== 24) {
    return process.nextTick(() => {
      stream.emit('error', Error('Wrong key length. Key must be 192bit.'))
    })
  }

  const aes = new AES(key.slice(0, 16))
  const ctr = new CTR(aes, key.slice(16))

  function write (d) {
    ctr.encrypt(d)
    this.emit('data', d)
  }

  function end () {
    const mac = ctr.condensedMac()
    const newkey = new Buffer(32)
    key.copy(newkey)
    mac.copy(newkey, 24)

    for (let i = 0; i < 16; i++) {
      newkey.writeUInt8(newkey.readUInt8(i) ^ newkey.readUInt8(16 + i), i)
    }

    stream.key = newkey
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

function megaDecrypt (key, options) {
  if (!options) options = {}
  key = formatKey(key)

  const stream = through(write, end)

  const aes = getCipher(key)
  const ctr = new CTR(aes, key.slice(16))

  function write (d) {
    ctr.decrypt(d)
    this.emit('data', d)
  }

  function end () {
    const mac = ctr.condensedMac()
    if (!mac.equals(key.slice(24)) && !options.ignoreMac) {
      return this.emit('error', Error('MAC verification failed'))
    }
    this.emit('end')
  }

  return pipeline(chunkSizeSafe(16), stream)
}

export { megaEncrypt, megaDecrypt }

function constantTimeCompare (bufferA, bufferB) {
  if (bufferA.length !== bufferB.length) return false

  const len = bufferA.length
  let result = 0

  for (let i = 0; i < len; i++) {
    result |= bufferA[i] ^ bufferB[i]
  }

  return result === 0
}

export { constantTimeCompare }
