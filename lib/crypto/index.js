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

function megaEncrypt (key) {
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
  const ctr = new CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)])

  function write (d) {
    ctr.encrypt(d)
    this.emit('data', d)
  }

  function end () {
    const mac = ctr.condensedMac()
    const newkey = new Buffer(32)
    key.copy(newkey)
    newkey.writeInt32BE(mac[0] ^ mac[1], 24)
    newkey.writeInt32BE(mac[2] ^ mac[3], 28)
    for (let i = 0; i < 16; i++) {
      newkey.writeUInt8(newkey.readUInt8(i) ^ newkey.readUInt8(16 + i), i)
    }
    stream.key = newkey
    this.emit('end')
  }

  stream = pipeline(chunkSizeSafe(16), stream)
  return stream
}

function megaDecrypt (key) {
  key = formatKey(key)

  const stream = through(write, end)

  const aes = getCipher(key)
  const ctr = new CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)])

  function write (d) {
    ctr.decrypt(d)
    this.emit('data', d)
  }

  function end () {
    const mac = ctr.condensedMac()
    if ((mac[0] ^ mac[1]) !== key.readInt32BE(24) || (mac[2] ^ mac[3]) !== key.readInt32BE(28)) {
      return this.emit('error', new Error('MAC verification failed'))
    }
    this.emit('end')
  }

  return pipeline(chunkSizeSafe(16), stream)
}

export { megaEncrypt, megaDecrypt }
