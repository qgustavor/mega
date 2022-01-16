import { AES as SjclAES } from './sjcl'

// convert user-supplied password array
export function prepareKey (password) {
  let i, j, r
  let pkey = [0x93C467E3, 0x7DB0C7A4, 0xD1BE3F81, 0x0152CB56]

  for (r = 65536; r--;) {
    for (j = 0; j < password.length; j += 16) {
      const key = [0, 0, 0, 0]

      for (i = 0; i < 16; i += 4) {
        if (i + j < password.length) {
          key[i / 4] = password.readInt32BE(i + j)
        }
      }

      pkey = new SjclAES(key).encrypt(pkey)
    }
  }

  const key = Buffer.allocUnsafe(16)
  for (i = 0; i < 4; i++) {
    key.writeInt32BE(pkey[i], i * 4)
  }
  return key
}

// The same function but for version 2 accounts
export function prepareKeyV2 (password, info, cb) {
  const salt = Buffer.from(info.s, 'base64')
  const iterations = 100000
  const digest = 'SHA-512'

  window.crypto.subtle.importKey('raw', password, {
    name: 'PBKDF2'
  }, false, 'deriveKey').then(key => {
    return window.crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt,
      iterations,
      hash: { name: digest }
    }, key, 256)
  }).then(result => {
    cb(null, Buffer.from(result))
  }).catch(cb)
}

class AES {
  constructor (key) {
    if (key.length !== 16) throw Error('Wrong key length. Key must be 128bit.')
    const a32 = []
    for (let i = 0; i < 4; i++) a32[i] = key.readInt32BE(i * 4)
    this.aes = new SjclAES(a32)
  }

  encryptCBC (buffer) {
    let iv = [0, 0, 0, 0]
    const d = Array(4)
    let i, j

    for (i = 0; i < buffer.length; i += 16) {
      for (j = 0; j < 4; j++) {
        d[j] = buffer.readUInt32BE(i + j * 4) ^ iv[j]
      }
      iv = this.aes.encrypt(d)

      for (j = 0; j < 4; j++) {
        buffer.writeInt32BE(iv[j], i + j * 4)
      }
    }
  }

  decryptCBC (buffer) {
    let iv = [0, 0, 0, 0]
    let d = Array(4)
    let t = Array(4)
    let i, j

    for (i = 0; i < buffer.length; i += 16) {
      for (j = 0; j < 4; j++) {
        d[j] = buffer.readUInt32BE(i + j * 4)
      }
      t = d

      d = this.aes.decrypt(d)

      for (j = 0; j < 4; j++) {
        buffer.writeInt32BE(d[j] ^ iv[j], i + j * 4)
      }
      iv = t
    }
  }

  stringhash (buffer) {
    let h32 = [0, 0, 0, 0]
    for (let i = 0; i < buffer.length; i += 4) {
      if (buffer.length - i < 4) {
        const len = buffer.length - i
        h32[i / 4 & 3] ^= buffer.readIntBE(i, len) << (4 - len) * 8
      } else {
        h32[i / 4 & 3] ^= buffer.readInt32BE(i)
      }
    }

    for (let i = 16384; i--;) h32 = this.aes.encrypt(h32)

    const b = Buffer.allocUnsafe(8)
    b.writeInt32BE(h32[0], 0)
    b.writeInt32BE(h32[2], 4)
    return b
  }

  encryptECB (key) {
    let d = []
    for (let i = 0; i < key.length; i += 16) {
      d[0] = key.readInt32BE(i)
      d[1] = key.readInt32BE(i + 4)
      d[2] = key.readInt32BE(i + 8)
      d[3] = key.readInt32BE(i + 12)

      d = this.aes.encrypt(d)

      key.writeInt32BE(d[0], i)
      key.writeInt32BE(d[1], i + 4)
      key.writeInt32BE(d[2], i + 8)
      key.writeInt32BE(d[3], i + 12)
    }
    return key
  }

  decryptECB (key) {
    let d = []
    for (let i = 0; i < key.length; i += 16) {
      d[0] = key.readInt32BE(i)
      d[1] = key.readInt32BE(i + 4)
      d[2] = key.readInt32BE(i + 8)
      d[3] = key.readInt32BE(i + 12)

      d = this.aes.decrypt(d)

      key.writeInt32BE(d[0], i)
      key.writeInt32BE(d[1], i + 4)
      key.writeInt32BE(d[2], i + 8)
      key.writeInt32BE(d[3], i + 12)
    }
    return key
  }
}

class CTR {
  constructor (aes, nonce, start = 0) {
    this.aes = aes

    this.nonce = nonce.slice(0, 8)
    this.increment = 131072 // 2**17
    this.posNext = this.increment
    this.pos = 0

    this.ctr = Buffer.alloc(16)
    this.nonce.copy(this.ctr, 0)

    this.mac = Buffer.alloc(16)
    this.nonce.copy(this.mac, 0)
    this.nonce.copy(this.mac, 8)
    this.macs = []

    this.incrementCTR(start / 16)
  }

  condensedMac () {
    if (this.mac) {
      this.macs.push(this.mac)
      this.mac = undefined
    }

    const mac = Buffer.alloc(16)

    for (let i = 0; i < this.macs.length; i++) {
      for (let j = 0; j < 16; j++) mac[j] ^= this.macs[i][j]
      this.aes.encryptECB(mac)
    }

    const macBuffer = Buffer.allocUnsafe(8)
    macBuffer.writeInt32BE(mac.readInt32BE(0) ^ mac.readInt32BE(4), 0)
    macBuffer.writeInt32BE(mac.readInt32BE(8) ^ mac.readInt32BE(12), 4)
    return macBuffer
  }

  encrypt (buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      const enc = this.aes.encryptECB(Buffer.from(this.ctr))

      for (let j = 0; j < 16; j++) {
        this.mac[j] ^= buffer[i + j]
        buffer[i + j] ^= enc[j]
      }

      this.aes.encryptECB(this.mac)
      this.incrementCTR()
    }
  }

  decrypt (buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      const enc = this.aes.encryptECB(Buffer.from(this.ctr))

      for (let j = 0; j < 16; j++) {
        buffer[i + j] ^= enc[j]
        this.mac[j] ^= buffer[i + j]
      }

      this.aes.encryptECB(this.mac)
      this.incrementCTR()
    }
  }

  incrementCTR (cnt = 1) {
    for (let i = 0; i < cnt; i++) this.checkMacBounding()

    const buf = this.ctr
    let i = 15
    let mod
    while (cnt !== 0) {
      mod = (cnt + buf[i]) % 256
      cnt = Math.floor((cnt + buf[i]) / 256)
      buf[i] = mod
      i -= 1
      if (i < 0) i = 15
    }
  }

  checkMacBounding () {
    this.pos += 16
    if (this.pos >= this.posNext) {
      this.macs.push(Buffer.from(this.mac))
      this.nonce.copy(this.mac, 0)
      this.nonce.copy(this.mac, 8)

      if (this.increment < 1048576) {
        this.increment += 131072
      }
      this.posNext += this.increment
    }
  }
}

export { AES, CTR }
