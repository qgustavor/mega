var sjcl = require('./sjcl')

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

// convert user-supplied password array
exports.prepare_key = function(a)
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
          key[i/4] = a.readInt32BE(i+j, false);
        }
      }
      aes = new sjcl.aes(key)
      pkey = aes.encrypt(pkey)
    }
  }
  var key = new Buffer(16)
  for (i = 0; i < 4; i++) key.writeInt32BE(pkey[i], i * 4)
  return key
}

function AES(key) {
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


// encrypt Buffer in CTR mode, return MAC
AES.prototype.encrypt_ctr_mac = function(b, nonce, pos)
{
  var ctr = [nonce[0],nonce[1],(pos/0x1000000000) >>> 0,(pos/0x10) >>> 0];
  var mac = [ctr[0],ctr[1],ctr[0],ctr[1]];

  var enc, i, j, len, v;

  var data0, data1, data2, data3;

  len = b.length-16;

  var v = new DataView(b);

  for (i = 0; i < len; i += 16)
  {
    data0 = v.getUint32(i,false);
    data1 = v.getUint32(i+4,false);
    data2 = v.getUint32(i+8,false);
    data3 = v.getUint32(i+12,false);

    // compute MAC
    mac[0] ^= data0;
    mac[1] ^= data1;
    mac[2] ^= data2;
    mac[3] ^= data3;
    mac = this.aes.encrypt(mac);

    // encrypt using CTR
    enc = this.aes.encrypt(ctr);
    v.setUint32(i,data0 ^ enc[0],false);
    v.setUint32(i+4,data1 ^ enc[1],false);
    v.setUint32(i+8,data2 ^ enc[2],false);
    v.setUint32(i+12,data3 ^ enc[3],false);

    if (!(++ctr[3])) ctr[2]++;
  }

  if (i < b.length)
  {
    var fullbuf = new Uint8Array(b);
    var tmpbuf = new ArrayBuffer(16);
    var tmparray = new Uint8Array(tmpbuf);

    tmparray.set(fullbuf.subarray(i));

    v = new DataView(tmpbuf);

    enc = this.aes.encrypt(ctr);

    data0 = v.getUint32(0,false);
    data1 = v.getUint32(4,false);
    data2 = v.getUint32(8,false);
    data3 = v.getUint32(12,false);

    mac[0] ^= data0;
    mac[1] ^= data1;
    mac[2] ^= data2;
    mac[3] ^= data3;
    mac = this.aes.encrypt(mac);

    enc = this.aes.encrypt(ctr);
    v.setUint32(0,data0 ^ enc[0],false);
    v.setUint32(4,data1 ^ enc[1],false);
    v.setUint32(8,data2 ^ enc[2],false);
    v.setUint32(12,data3 ^ enc[3],false);

    fullbuf.set(tmparray.subarray(0,j = fullbuf.length-i),i);
  }

  return mac;
}

// decrypt Buffer in CTR mode, return MAC
AES.prototype.decrypt_ctr_mac = function(b, nonce, pos) {
  var ctr = [nonce[0],nonce[1],(pos/0x1000000000) >>> 0,(pos/0x10) >>> 0];
  var mac = [ctr[0],ctr[1],ctr[0],ctr[1]];
  var enc, len, i, j, v;

  var data0, data1, data2, data3;

  len = b.length-16;  // @@@ -15?
  var v = new DataView(b);

  for (i = 0; i < len; i += 16) {
    enc = this.aes.encrypt(ctr);

    data0 = v.getUint32(i,false)^enc[0];
    data1 = v.getUint32(i+4,false)^enc[1];
    data2 = v.getUint32(i+8,false)^enc[2];
    data3 = v.getUint32(i+12,false)^enc[3];

    v.setUint32(i,data0,false);
    v.setUint32(i+4,data1,false);
    v.setUint32(i+8,data2,false);
    v.setUint32(i+12,data3,false);

    mac[0] ^= data0;
    mac[1] ^= data1;
    mac[2] ^= data2;
    mac[3] ^= data3;


    mac = this.aes.encrypt(mac);

    if (!(++ctr[3])) ctr[2]++;
  }

  if (i < b.length) {
    var fullbuf = new Uint8Array(b);
    var tmpbuf = new ArrayBuffer(16);
    var tmparray = new Uint8Array(tmpbuf);

    tmparray.set(fullbuf.subarray(i));

    v = new DataView(tmpbuf);

    enc = this.aes.encrypt(ctr);
    data0 = v.getUint32(0,false)^enc[0];
    data1 = v.getUint32(4,false)^enc[1];
    data2 = v.getUint32(8,false)^enc[2];
    data3 = v.getUint32(12,false)^enc[3];

    v.setUint32(0,data0,false);
    v.setUint32(4,data1,false);
    v.setUint32(8,data2,false);
    v.setUint32(12,data3,false);

    fullbuf.set(tmparray.subarray(0,j = fullbuf.length-i),i);

    while (j < 16) tmparray[j++] = 0;

    mac[0] ^= v.getUint32(0,false);
    mac[1] ^= v.getUint32(4,false);
    mac[2] ^= v.getUint32(8,false);
    mac[3] ^= v.getUint32(12,false);
    mac = this.aes.encrypt(mac);
  }

  return mac;
}

AES.prototype.condenseMacs = function(macs) {
  var i, j;
  var mac = [0,0,0,0];

  for (i = 0; i < macs.length; i++)
  {
    for (j = 0; j < 4; j++) mac[j] ^= macs[i][j];
    mac = this.aes.encrypt(mac);
  }
  return mac;
}

AES.prototype.stringhash = function(buffer)
{
  var h32 = [0,0,0,0]

  for (i = 0; i < buffer.length; i+=4) {
    h32[(i/4)&3] ^= buffer.readInt32BE(i)
  }
  for (i = 16384; i--; ) h32 = this.aes.encrypt(h32)

  var b = new Buffer(8)
  b.writeInt32BE(h32[0], 0)
  b.writeInt32BE(h32[2], 4)
  return exports.base64Addons(b.toString('base64'))
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

exports.AES = AES
