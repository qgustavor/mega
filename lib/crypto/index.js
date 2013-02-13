var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var sjcl = require('./sjcl')

exports.formatKey = function(key) {
  return typeof key === 'string' ? exports.d64(key) : key
}

// Base64 encode/decode + Mega weirdness
// MEGA API uses a variation of base64 with -_ instead of +/
// and the trailing = stripped
exports.e64 = function(buffer) {
  return buffer.toString('base64').replace(/\+/g,'-').replace(/\//g,'_')
    .replace(/=/g,'')
}
exports.d64 = function(s) {
  s += '=='.substr((2-s.length*3)&3)
  s = s.replace(/\-/g,'+').replace(/_/g,'/').replace(/,/g,'')
  return new Buffer(s, 'base64')
}

// convert user-supplied password array
exports.prepareKey = function(a)
{
  var i, j, r;
  var pkey = [0x93C467E3,0x7DB0C7A4,0xD1BE3F81,0x0152CB56]
  for (r = 65536; r--; )
  {
    for (j = 0; j < a.length; j += 16)
    {
      key = [0,0,0,0]

      for (i = 0; i < 16; i+=4) {
        if (i+j < a.length) {
          key[i/4] = a.readInt32BE(i+j, true)
        }
      }
      aes = new sjcl.aes(key)
      pkey = aes.encrypt(pkey)
    }
  }
  var key = new Buffer(16)
  for (i = 0; i < 4; i++) key.writeInt32BE(pkey[i], i * 4, true)
  return key
}

function AES(key) {
  var a32 = []
  for (var i = 0; i < 4; i++) a32[i] = key.readInt32BE(i * 4)
  this.aes = new sjcl.aes(a32)
}

// encrypt Buffer in CBC mode (zero IV)
AES.prototype.encryptCBC = function (buffer) {
  var iv = [0,0,0,0], d = Array(4);
  var i, j;

  for (i = 0; i < buffer.length; i += 16)
  {
    for (j = 0; j < 4; j++) {
      d[j] = buffer.readUInt32BE(i + j * 4, false) ^ iv[j]
    }
    iv = this.aes.encrypt(d);

    for (j = 0; j < 4; j++) {
      buffer.writeInt32BE(iv[j], i + j * 4, false)
    }
  }
}

// decrypt Buffer in CBC mode (zero IV)
AES.prototype.decryptCBC= function (buffer) {
  var iv = [0,0,0,0], d = Array(4), t = Array(4);
  var i, j;

  for (i = 0; i < buffer.length; i += 16) {
    for (j = 0; j < 4; j++) {
      d[j] = buffer.readUInt32BE(i + j * 4, false)
    }
    t = d;

    d = this.aes.decrypt(d);

    for (j = 0; j < 4; j++) {
      buffer.writeInt32BE(d[j] ^ iv[j], i + j * 4, false)
    }
    iv = t;
  }
}

AES.prototype.stringhash = function(buffer)
{
  var h32 = [0,0,0,0]
  for (i = 0; i < buffer.length; i+=4) {
    h32[(i/4)&3] ^= buffer.readInt32BE(i, true)
  }
  for (i = 16384; i--; ) h32 = this.aes.encrypt(h32)

  var b = new Buffer(8)
  b.writeInt32BE(h32[0], 0, true)
  b.writeInt32BE(h32[2], 4, true)
  return exports.e64(b)
}

AES.prototype.decryptKey = function(key) {
  var d = []
  for (var i = 0; i < key.length; i += 16) {
    d[0] = key.readInt32BE(i, false)
    d[1] = key.readInt32BE(i + 4, false)
    d[2] = key.readInt32BE(i + 8, false)
    d[3] = key.readInt32BE(i + 12, false)

    var d = this.aes.decrypt(d)

    key.writeInt32BE(d[0], i, false)
    key.writeInt32BE(d[1], i + 4, false)
    key.writeInt32BE(d[2], i + 8, false)
    key.writeInt32BE(d[3], i + 12, false)
  }
  return key
}


AES.prototype.encryptKey = function(key) {
  var d = []
  for (var i = 0; i < key.length; i += 16) {
    d[0] = key.readInt32BE(i, false)
    d[1] = key.readInt32BE(i + 4, false)
    d[2] = key.readInt32BE(i + 8, false)
    d[3] = key.readInt32BE(i + 12, false)

    var d = this.aes.encrypt(d)

    key.writeInt32BE(d[0], i, false)
    key.writeInt32BE(d[1], i + 4, false)
    key.writeInt32BE(d[2], i + 8, false)
    key.writeInt32BE(d[3], i + 12, false)
  }
  return key
}


function CTR(aes, nonce) {
  this.aes = aes.aes
  this.nonce = nonce

  this.posNext = this.increment = 131072 // 2**17
  this.pos = 0

  this.encrypt = this._process.bind(this, true)
  this.decrypt = this._process.bind(this, false)

  this.ctr = [this.nonce[0], this.nonce[1], 0, 0]
  this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]

  this.macs = []

  this.on('mac', function(m) {
    this.macs.push(m)
  })

}
inherits(CTR, EventEmitter)

CTR.prototype.condensedMac = function() {
  if (this.mac) {
    this.macs.push(this.mac)
    this.mac = undefined
  }
  var i, j;
  var mac = [0,0,0,0]

  for (i = 0; i < this.macs.length; i++)
  {
    for (j = 0; j < 4; j++) mac[j] ^= this.macs[i][j]
    mac = this.aes.encrypt(mac)
  }
  return mac
}

CTR.prototype._process = function(encrypt, buffer) {

  for (var i = 0; i < buffer.length; i += 16) {

    var d = [], enc

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

    }
    else {
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

    if (!(++this.ctr[3])) this.ctr[2]++;

    this.pos += 16
    if (this.pos >= this.posNext) {
      this.emit('mac', this.mac)
      this.ctr[2] = (this.pos/0x1000000000) >>> 0
      this.ctr[3] = (this.pos/0x10) >>> 0
      this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]]
      if (this.increment < 1048576) this.increment += 131072
      this.posNext += this.increment
    }

  }

}



exports.AES = AES
exports.CTR = CTR
