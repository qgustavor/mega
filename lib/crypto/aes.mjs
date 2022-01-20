import crypto from 'crypto'

// convert user-supplied password array
export function prepareKey (password) {
  let i, j, r
  let pkey = Buffer.from([147, 196, 103, 227, 125, 176, 199, 164, 209, 190, 63, 129, 1, 82, 203, 86])

  for (r = 65536; r--;) {
    for (j = 0; j < password.length; j += 16) {
      const key = Buffer.alloc(16)

      for (i = 0; i < 16; i += 4) {
        if (i + j < password.length) {
          password.copy(key, i, i + j, i + j + 4)
        }
      }

      pkey = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0))
        .setAutoPadding(false)
        .update(pkey)
    }
  }

  return pkey
}

// The same function but for version 2 accounts
export function prepareKeyV2 (password, info, cb) {
  const salt = Buffer.from(info.s, 'base64')
  const iterations = 100000
  const digest = 'sha512'

  crypto.pbkdf2(password, salt, iterations, 32, digest, cb)
}

class AES {
  constructor (key) {
    if (key.length !== 16) throw Error('Wrong key length. Key must be 128bit.')
    this.key = key
  }

  encryptCBC (buffer) {
    const iv = Buffer.alloc(16, 0)
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv)
      .setAutoPadding(false)

    const result = Buffer.concat([cipher.update(buffer), cipher.final()])
    result.copy(buffer)
    return result
  }

  decryptCBC (buffer) {
    const iv = Buffer.alloc(16, 0)
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv)
      .setAutoPadding(false)

    const result = Buffer.concat([decipher.update(buffer), decipher.final()])
    result.copy(buffer)
    return result
  }

  stringhash (buffer) {
    const h32 = [0, 0, 0, 0]
    for (let i = 0; i < buffer.length; i += 4) {
      if (buffer.length - i < 4) {
        const len = buffer.length - i
        h32[i / 4 & 3] ^= buffer.readIntBE(i, len) << (4 - len) * 8
      } else {
        h32[i / 4 & 3] ^= buffer.readInt32BE(i)
      }
    }

    let hash = Buffer.allocUnsafe(16)
    for (let i = 0; i < 4; i++) {
      hash.writeInt32BE(h32[i], i * 4, true)
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0))
    for (let i = 16384; i--;) hash = cipher.update(hash)

    const result = Buffer.allocUnsafe(8)
    hash.copy(result, 0, 0, 4)
    hash.copy(result, 4, 8, 12)
    return result
  }

  encryptECB (buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0))
      .setAutoPadding(false)

    const result = cipher.update(buffer)
    result.copy(buffer)
    return result
  }

  decryptECB (buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, Buffer.alloc(0))
      .setAutoPadding(false)

    const result = decipher.update(buffer)
    result.copy(buffer)
    return result
  }
}

class CTR {
  constructor (aes, nonce, start = 0) {
    this.key = aes.key
    this.nonce = nonce.slice(0, 8)

    const iv = Buffer.alloc(16)
    this.nonce.copy(iv, 0)

    if (start !== 0) {
      this.incrementCTRBuffer(iv, start / 16)
    }

    // create ciphers on demand
    this.encrypt = (buffer) => {
      this.encryptCipher = crypto.createCipheriv('aes-128-ctr', this.key, iv)
      this.encrypt = this._encrypt
      return this.encrypt(buffer)
    }

    this.decrypt = (buffer) => {
      this.decryptCipher = crypto.createDecipheriv('aes-128-ctr', this.key, iv)
      this.decrypt = this._decrypt
      return this.decrypt(buffer)
    }
  }

  _encrypt (buffer) {
    return this.encryptCipher.update(buffer).copy(buffer)
  }

  _decrypt (buffer) {
    return this.decryptCipher.update(buffer).copy(buffer)
  }

  // From https://github.com/jrnewell/crypto-aes-ctr/blob/77156490fcf32870215680c8db035c01390144b2/lib/index.js#L4-L18
  incrementCTRBuffer (buf, cnt) {
    const len = buf.length
    let i = len - 1
    let mod
    while (cnt !== 0) {
      mod = (cnt + buf[i]) % 256
      cnt = Math.floor((cnt + buf[i]) / 256)
      buf[i] = mod
      i -= 1
      if (i < 0) {
        i = len - 1
      }
    }
  }
}

// MEGA's MAC implementation is similar to ECBC-MAC
// but because it encrypts the MAC twice it's weird,
// also implementing it natively is slower.
class MAC {
  constructor (aes, nonce) {
    this.key = aes.key
    this.nonce = nonce.slice(0, 8)
    this.macCipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0))

    this.posNext = this.increment = 131072 // 2**17
    this.pos = 0

    this.macs = []
    this.mac = Buffer.alloc(16)
    this.nonce.copy(this.mac, 0)
    this.nonce.copy(this.mac, 8)
  }

  condense () {
    if (this.mac) {
      this.macs.push(this.mac)
      this.mac = undefined
    }

    let mac = Buffer.alloc(16, 0)

    for (const item of this.macs) {
      for (let j = 0; j < 16; j++) mac[j] ^= item[j]
      mac = this.macCipher.update(mac)
    }

    const macBuffer = Buffer.allocUnsafe(8)
    macBuffer.writeInt32BE(mac.readInt32BE(0) ^ mac.readInt32BE(4), 0)
    macBuffer.writeInt32BE(mac.readInt32BE(8) ^ mac.readInt32BE(12), 4)
    return macBuffer
  }

  update (buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      for (let j = 0; j < 16; j++) this.mac[j] ^= buffer[i + j]
      this.mac = this.macCipher.update(this.mac)
      this.checkBounding()
    }
  }

  checkBounding () {
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

export { AES, CTR, MAC }
