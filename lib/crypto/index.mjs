import through from 'through'
import pipeline from 'stream-combiner'
import { chunkSizeSafe } from '../util.mjs'
import secureRandom from 'secure-random'
import { AES, CTR, MAC, prepareKey, prepareKeyV2 } from './aes.mjs'

export { AES, CTR, MAC, prepareKey, prepareKeyV2 }

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
  return Buffer.from(s, 'base64')
}
export { e64, d64 }

export function getCipher (key) {
  return new AES(unmergeKeyMac(key).slice(0, 16))
}

function megaEncrypt (key, options = {}) {
  const start = options.start || 0
  if (start !== 0) {
    throw Error('Encryption cannot start midstream otherwise MAC verification will fail.')
  }
  key = formatKey(key)

  if (!key) {
    key = secureRandom(24)
  }
  if (!(key instanceof Buffer)) {
    key = Buffer.from(key)
  }

  let stream = through(write, end)

  if (key.length !== 24) {
    return process.nextTick(() => {
      stream.emit('error', Error('Wrong key length. Key must be 192bit.'))
    })
  }

  const aes = new AES(key.slice(0, 16))
  const ctr = new CTR(aes, key.slice(16), start)
  const mac = new MAC(aes, key.slice(16))

  function write (d) {
    mac.update(d)
    ctr.encrypt(d)
    this.emit('data', d)
  }

  function end () {
    stream.key = mergeKeyMac(key, mac.condense())
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

function megaDecrypt (key, options = {}) {
  const start = options.start || 0
  if (start !== 0) options.disableVerification = true
  if (start % 16 !== 0) throw Error('start argument of megaDecrypt must be a multiple of 16')
  key = formatKey(key)

  let stream = through(write, end)
  const aes = getCipher(key)
  const ctr = new CTR(aes, key.slice(16), start)
  const mac = !options.disableVerification && new MAC(aes, key.slice(16))

  function write (d) {
    ctr.decrypt(d)
    if (mac) mac.update(d)
    this.emit('data', d)
  }

  function end () {
    if (!options.disableVerification && !mac.condense().equals(key.slice(24))) {
      return this.emit('error', Error('MAC verification failed'))
    }
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

function megaVerify (key) {
  key = formatKey(key)

  let stream = through(write, end)
  const aes = getCipher(key)
  const mac = new MAC(aes, key.slice(16))

  function write (d) {
    mac.update(d)
    this.emit('data', d)
  }

  function end () {
    if (!mac.condense().equals(key.slice(24))) {
      return this.emit('error', Error('MAC verification failed'))
    }
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

export { megaEncrypt, megaDecrypt, megaVerify }

function unmergeKeyMac (key) {
  const newKey = Buffer.alloc(32)
  key.copy(newKey)

  for (let i = 0; i < 16; i++) {
    newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i, true), i)
  }

  return newKey
}

function mergeKeyMac (key, mac) {
  const newKey = Buffer.alloc(32)
  key.copy(newKey)
  mac.copy(newKey, 24)

  for (let i = 0; i < 16; i++) {
    newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i), i)
  }

  return newKey
}

export { unmergeKeyMac, mergeKeyMac }

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
