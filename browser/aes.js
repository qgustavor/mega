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
          key[i / 4] = password.readInt32BE(i + j, true)
        }
      }

      pkey = new SjclAES(key).encrypt(pkey)
    }
  }

  const key = new Buffer(16)
  for (i = 0; i < 4; i++) {
    key.writeInt32BE(pkey[i], i * 4, true)
  }
  return key
}

class AES {
  constructor (key) {
    const a32 = []
    for (let i = 0; i < 4; i++) a32[i] = key.readInt32BE(i * 4)
    this.aes = new SjclAES(a32)
  }

  encryptCBC (buffer) {
    let iv = [0, 0, 0, 0]
    let d = Array(4)
    let i, j

    for (i = 0; i < buffer.length; i += 16) {
      for (j = 0; j < 4; j++) {
        d[j] = buffer.readUInt32BE(i + j * 4, false) ^ iv[j]
      }
      iv = this.aes.encrypt(d)

      for (j = 0; j < 4; j++) {
        buffer.writeInt32BE(iv[j], i + j * 4, false)
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
        d[j] = buffer.readUInt32BE(i + j * 4, false)
      }
      t = d

      d = this.aes.decrypt(d)

      for (j = 0; j < 4; j++) {
        buffer.writeInt32BE(d[j] ^ iv[j], i + j * 4, false)
      }
      iv = t
    }
  }

  stringhash (buffer) {
    let h32 = [0, 0, 0, 0]
    for (let i = 0; i < buffer.length; i += 4) {
      h32[(i / 4) & 3] ^= buffer.readInt32BE(i, true)
    }

    for (let i = 16384; i--;) h32 = this.aes.encrypt(h32)

    const b = new Buffer(8)
    b.writeInt32BE(h32[0], 0, true)
    b.writeInt32BE(h32[2], 4, true)
    return b
  }

  encryptECB (key) {
    let d = []
    for (let i = 0; i < key.length; i += 16) {
      d[0] = key.readInt32BE(i, false)
      d[1] = key.readInt32BE(i + 4, false)
      d[2] = key.readInt32BE(i + 8, false)
      d[3] = key.readInt32BE(i + 12, false)

      d = this.aes.encrypt(d)

      key.writeInt32BE(d[0], i, false)
      key.writeInt32BE(d[1], i + 4, false)
      key.writeInt32BE(d[2], i + 8, false)
      key.writeInt32BE(d[3], i + 12, false)
    }
    return key
  }

  decryptECB (key) {
    let d = []
    for (let i = 0; i < key.length; i += 16) {
      d[0] = key.readInt32BE(i, false)
      d[1] = key.readInt32BE(i + 4, false)
      d[2] = key.readInt32BE(i + 8, false)
      d[3] = key.readInt32BE(i + 12, false)

      d = this.aes.decrypt(d)

      key.writeInt32BE(d[0], i, false)
      key.writeInt32BE(d[1], i + 4, false)
      key.writeInt32BE(d[2], i + 8, false)
      key.writeInt32BE(d[3], i + 12, false)
    }
    return key
  }
}

class CTR {
  constructor (aes, nonce, start = 0) {
    this.aes = aes.aes
    this.nonce = [nonce.readInt32BE(0), nonce.readInt32BE(4)]

    this.increment = 131072 // 2**17
    this.posNext = start + this.increment
    this.pos = start

    this.ctr = [this.nonce[0], this.nonce[1], 0, 0]
    if (start !== 0) this.incrementCTRBuffer(start / 16)

    this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]
    this.macs = []
  }

  condensedMac () {
    if (this.mac) {
      this.macs.push(this.mac)
      this.mac = undefined
    }

    let mac = [0, 0, 0, 0]

    for (let i = 0; i < this.macs.length; i++) {
      for (let j = 0; j < 4; j++) mac[j] ^= this.macs[i][j]
      mac = this.aes.encrypt(mac)
    }

    const macBuffer = new Buffer(8)
    macBuffer.writeInt32BE(mac[0] ^ mac[1], 0)
    macBuffer.writeInt32BE(mac[2] ^ mac[3], 4)
    return macBuffer
  }

  encrypt (buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      let d = []

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
      let enc = this.aes.encrypt(this.ctr)
      buffer.writeInt32BE(d[0] ^ enc[0], i, true)
      buffer.writeInt32BE(d[1] ^ enc[1], i + 4, true)
      buffer.writeInt32BE(d[2] ^ enc[2], i + 8, true)
      buffer.writeInt32BE(d[3] ^ enc[3], i + 12, true)

      this.incrementCTR()
    }
  }

  decrypt (buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      let d = []
      let enc = this.aes.encrypt(this.ctr)

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

      this.incrementCTR()
    }
  }

  incrementCTR () {
    if (!(++this.ctr[3])) this.ctr[2]++

    this.pos += 16
    if (this.pos >= this.posNext) {
      this.macs.push(this.mac)
      this.ctr[2] = (this.pos / 0x1000000000) >>> 0
      this.ctr[3] = (this.pos / 0x10) >>> 0

      this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]

      if (this.increment < 1048576) {
        this.increment += 131072
      }
      this.posNext += this.increment
    }
  }

  incrementCTRBuffer (cnt) {
    // todo: improve performance
    for (let i = 0; i < cnt; i++) {
      this.incrementCTR()
    }
  }
}

export {AES, CTR}
