exports.formatKey = function(key) {
  if (typeof key === 'string') {
    return new Buffer(exports.base64Clean(key), 'base64')
  }
  return key
}

// MEGA API uses a variation of base64 with -_ instead of +/
// and the trailing = stripped
exports.base64Addons = function(s) {
  return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}

exports.base64Clean = function(s) {
  s += '=='.substr((2-s.length*3)&3)
  return s.replace(/\-/g,'+').replace(/_/g,'/').replace(/,/g,'')
}


function AES(key) {
  var sjcl = require('./sjcl')
  var a32 = []
  for (var i = 0; i < 4; i++) a32[i] = key.readInt32BE(i * 4)
  this.aes = new sjcl.aes(a32)
}

// encrypt Buffer in CBC mode (zero IV)
AES.prototype.encrypt_cbc = function (buffer) {
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
AES.prototype.decrypt_cbc = function (buffer) {
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

exports.AES = AES
