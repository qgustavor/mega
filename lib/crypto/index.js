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

// decrypt Buffer in CBC mode (zero IV)
AES.prototype.decrypt_cbc = function (buffer) {
  var v = new DataView(buffer);
  var iv = [0,0,0,0], d = Array(4), t = Array(4);
  var i;

  for (i = 0; i < buffer.length; i += 16)
  {
    d[0] = v.getUint32(i,false);
    d[1] = v.getUint32(i+4,false);
    d[2] = v.getUint32(i+8,false);
    d[3] = v.getUint32(i+12,false);
    t = d;

    d = this.aes.decrypt(d);

    v.setUint32(i,d[0] ^ iv[0],false);
    v.setUint32(i+4,d[1] ^ iv[1],false);
    v.setUint32(i+8,d[2] ^ iv[2],false);
    v.setUint32(i+12,d[3] ^ iv[3],false);
    iv = t;
  }
}

exports.AES = AES
