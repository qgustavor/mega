import crypto from 'crypto'
import { AES as SjclAES } from './sjcl'
import { EventEmitter } from 'events'

// convert user-supplied password array
export function prepareKey (password) {
  let i, j, r
  let pkey = Buffer.from([147, 196, 103, 227, 125, 176, 199, 164, 209, 190, 63, 129, 1, 82, 203, 86])

  for (r = 65536; r--;) {
    for (j = 0; j < password.length; j += 16) {
      const key = [0, 0, 0, 0]

      for (i = 0; i < 16; i += 4) {
        if (i + j < password.length) {
          key[i / 4] = password.readInt32BE(i + j, true)
        }
      }

      // todo: remove the buffer to array to buffer conversion
      const keyBuffer = new Buffer(16)
      for (i = 0; i < 4; i++) {
        keyBuffer.writeInt32BE(key[i], i * 4, true)
      }

      const cipher = crypto.createCipheriv('aes-128-ecb', keyBuffer, Buffer.alloc(0))
      cipher.setAutoPadding(false)

      pkey = cipher.update(pkey)
    }
  }

  return pkey
}

class AES {
  constructor (key) {
    const a32 = []
    for (let i = 0; i < 4; i++) {
      a32[i] = key.readInt32BE(i * 4)
    }
    this.aes = new SjclAES(a32)
    this.key = key
  }

  encryptCBC (buffer) {
    const iv = Buffer.alloc(16, 0)
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv)
    cipher.setAutoPadding(false)

    const result = Buffer.concat([ cipher.update(buffer), cipher.final() ])
    result.copy(buffer)
    return result
  }

  decryptCBC (buffer) {
    const iv = Buffer.alloc(16, 0)
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv)
    decipher.setAutoPadding(false)

    const result = Buffer.concat([ decipher.update(buffer), decipher.final() ])
    result.copy(buffer)
    return result
  }

  stringhash (buffer) {
    let h32 = [0, 0, 0, 0]
    for (let i = 0; i < buffer.length; i += 4) {
      h32[(i / 4) & 3] ^= buffer.readInt32BE(i, true)
    }

    for (let i = 16384; i !== 0; i--) {
      h32 = this.aes.encrypt(h32)
    }

    const b = new Buffer(8)
    b.writeInt32BE(h32[0], 0, true)
    b.writeInt32BE(h32[2], 4, true)
    return b
  }

  decryptECB (buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, Buffer.alloc(0))
    decipher.setAutoPadding(false)

    const result = decipher.update(buffer)
    result.copy(buffer)
    return result
  }

  encryptECB (buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0))
    cipher.setAutoPadding(false)

    const result = cipher.update(buffer)
    result.copy(buffer)
    return result
  }
}

class CTR extends EventEmitter {
  constructor (aes, nonce) {
    super()
    this.aes = aes.aes
    this.key = aes.key
    this.nonce = nonce

    this.posNext = this.increment = 131072 // 2**17
    this.pos = 0

    this.encrypt = this._process.bind(this, true)
    this.decrypt = this._process.bind(this, false)

    this.ctr = [this.nonce[0], this.nonce[1], 0, 0]
    this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]

    this.macs = []

    this.on('mac', m => {
      this.macs.push(m)
    })
  }

  condensedMac () {
    if (this.mac) {
      this.macs.push(this.mac)
      this.mac = undefined
    }
    let i
    let j
    let mac = [0, 0, 0, 0]

    for (i = 0; i < this.macs.length; i++) {
      for (j = 0; j < 4; j++) mac[j] ^= this.macs[i][j]
      mac = this.aes.encrypt(mac)
    }
    return mac
  }

  _process (encrypt, buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      let d = []
      let enc

      if (encrypt) {
        d[0] = buffer.readInt32BE(i, true)
        d[1] = buffer.readInt32BE(i + 4, true)
        d[2] = buffer.readInt32BE(i + 8, true)
        d[3] = buffer.readInt32BE(i + 12, true)

        // compute MAC
        this.mac[0] ^= d[0]
        this.mac[1] ^= d[1]
        this.mac[2] ^= d[2]
        this.mac[3] ^= d[3]
        this.mac = this.aes.encrypt(this.mac)

        // encrypt using CTR
        enc = this.aes.encrypt(this.ctr)
        buffer.writeInt32BE(d[0] ^ enc[0], i, true)
        buffer.writeInt32BE(d[1] ^ enc[1], i + 4, true)
        buffer.writeInt32BE(d[2] ^ enc[2], i + 8, true)
        buffer.writeInt32BE(d[3] ^ enc[3], i + 12, true)
      } else {
        enc = this.aes.encrypt(this.ctr)

        d[0] = buffer.readInt32BE(i, true) ^ enc[0]
        d[1] = buffer.readInt32BE(i + 4, true) ^ enc[1]
        d[2] = buffer.readInt32BE(i + 8, true) ^ enc[2]
        d[3] = buffer.readInt32BE(i + 12, true) ^ enc[3]

        buffer.writeInt32BE(d[0], i, true)
        buffer.writeInt32BE(d[1], i + 4, true)
        buffer.writeInt32BE(d[2], i + 8, true)
        buffer.writeInt32BE(d[3], i + 12, true)

        this.mac[0] ^= buffer.readInt32BE(i, true)
        this.mac[1] ^= buffer.readInt32BE(i + 4, true)
        this.mac[2] ^= buffer.readInt32BE(i + 8, true)
        this.mac[3] ^= buffer.readInt32BE(i + 12, true)

        this.mac = this.aes.encrypt(this.mac)
      }

      if (!(++this.ctr[3])) this.ctr[2]++

      this.pos += 16
      if (this.pos >= this.posNext) {
        this.emit('mac', this.mac)
        this.ctr[2] = (this.pos / 0x1000000000) >>> 0
        this.ctr[3] = (this.pos / 0x10) >>> 0
        this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]
        if (this.increment < 1048576) this.increment += 131072
        this.posNext += this.increment
      }
    }
  }
}

export {AES, CTR}
