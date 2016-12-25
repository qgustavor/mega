'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var url = require('url');
var through = _interopDefault(require('through'));
var pipeline = _interopDefault(require('stream-combiner'));
var secureRandom = _interopDefault(require('secure-random'));
var crypto = _interopDefault(require('crypto'));
var events = require('events');
var _request = _interopDefault(require('request'));
var querystring = _interopDefault(require('querystring'));
var CombinedStream = _interopDefault(require('combined-stream'));

function streamToCb(stream, cb) {
  var chunks = [];
  var complete = void 0;
  stream.on('data', function (d) {
    chunks.push(d);
  });
  stream.on('end', function () {
    if (!complete) {
      complete = true;
      cb(null, Buffer.concat(chunks));
    }
  });
  stream.on('error', function (e) {
    if (!complete) {
      complete = true;
      cb(e);
    }
  });
}

function chunkSizeSafe(size) {
  var last = void 0;
  return through(function (d) {
    if (last) d = Buffer.concat([last, d]);

    var end = Math.floor(d.length / size) * size;

    if (!end) {
      last = last ? Buffer.concat([last, d]) : d;
    } else if (d.length > end) {
      last = d.slice(end);
      this.emit('data', d.slice(0, end));
    } else {
      last = undefined;
      this.emit('data', d);
    }
  }, function () {
    if (last) this.emit('data', last);
    this.emit('end');
  });
}

function detectSize(cb) {
  var chunks = [];
  var size = 0;
  return through(function (d) {
    chunks.push(d);
    size += d.length;
  }, function () {
    cb(size);
    chunks.forEach(this.emit.bind(this, 'data'));
    this.emit('end');
  });
}

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
  return typeof obj;
} : function (obj) {
  return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
};











var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();







var get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ("value" in desc) {
    return desc.value;
  } else {
    var getter = desc.get;

    if (getter === undefined) {
      return undefined;
    }

    return getter.call(receiver);
  }
};

var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};











var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};



var set = function set(object, property, value, receiver) {
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent !== null) {
      set(parent, property, value, receiver);
    }
  } else if ("value" in desc && desc.writable) {
    desc.value = value;
  } else {
    var setter = desc.set;

    if (setter !== undefined) {
      setter.call(receiver, value);
    }
  }

  return value;
};

/** @fileOverview Low-level AES implementation.
 *
 * This file contains a low-level implementation of AES, optimized for
 * size and for efficiency on several browsers.  It is based on
 * OpenSSL's aes_core.c, a public-domain implementation by Vincent
 * Rijmen, Antoon Bosselaers and Paulo Barreto.
 *
 * An older version of this implementation is available in the public
 * domain, but this one is (c) Emily Stark, Mike Hamburg, Dan Boneh,
 * Stanford University 2008-2010 and BSD-licensed for liability
 * reasons.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/**
 * Schedule out an AES key for both encryption and decryption.  This
 * is a low-level class.  Use a cipher mode to do bulk encryption.
 *
 * @constructor
 * @param {Array} key The key as an array of 4, 6 or 8 words.
 *
 * @class Advanced Encryption Standard (low-level interface)
 */
var AES$1 = function () {
  function AES(key) {
    classCallCheck(this, AES);

    if (!this._tables[0][0][0]) {
      this._precompute();
    }

    var i = void 0;
    var j = void 0;
    var tmp = void 0;
    var encKey = void 0;
    var decKey = void 0;
    var sbox = this._tables[0][4];
    var decTable = this._tables[1];
    var keyLen = key.length;
    var rcon = 1;

    if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
      throw new Error('invalid aes key size');
    }

    this._key = [encKey = key.slice(0), decKey = []];

    // schedule encryption keys
    for (i = keyLen; i < 4 * keyLen + 28; i++) {
      tmp = encKey[i - 1];

      // apply sbox
      if (i % keyLen === 0 || keyLen === 8 && i % keyLen === 4) {
        tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];

        // shift rows and add rcon
        if (i % keyLen === 0) {
          tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
          rcon = rcon << 1 ^ (rcon >> 7) * 283;
        }
      }

      encKey[i] = encKey[i - keyLen] ^ tmp;
    }

    // schedule decryption keys
    for (j = 0; i; j++, i--) {
      tmp = encKey[j & 3 ? i : i - 4];
      if (i <= 4 || j < 4) {
        decKey[j] = tmp;
      } else {
        decKey[j] = decTable[0][sbox[tmp >>> 24]] ^ decTable[1][sbox[tmp >> 16 & 255]] ^ decTable[2][sbox[tmp >> 8 & 255]] ^ decTable[3][sbox[tmp & 255]];
      }
    }
  }

  // public
  /* Something like this might appear here eventually
  name: "AES",
  blockSize: 4,
  keySizes: [4,6,8],
  */

  /**
   * Encrypt an array of 4 big-endian words.
   * @param {Array} data The plaintext.
   * @return {Array} The ciphertext.
   */


  createClass(AES, [{
    key: 'encrypt',
    value: function encrypt(data) {
      return this._crypt(data, 0);
    }

    /**
     * Decrypt an array of 4 big-endian words.
     * @param {Array} data The ciphertext.
     * @return {Array} The plaintext.
     */

  }, {
    key: 'decrypt',
    value: function decrypt(data) {
      return this._crypt(data, 1);
    }

    /**
     * Expand the S-box tables.
     *
     * @private
     */

  }, {
    key: '_precompute',
    value: function _precompute() {
      var encTable = this._tables[0];
      var decTable = this._tables[1];
      var sbox = encTable[4];
      var sboxInv = decTable[4];
      var i = void 0;
      var x = void 0;
      var xInv = void 0;
      var d = [];
      var th = [];
      var x2 = void 0;
      var x4 = void 0;
      var x8 = void 0;
      var s = void 0;
      var tEnc = void 0;
      var tDec = void 0;

      // Compute double and third tables
      for (i = 0; i < 256; i++) {
        th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i;
      }

      for (x = xInv = 0; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
        // Compute sbox
        s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
        s = s >> 8 ^ s & 255 ^ 99;
        sbox[x] = s;
        sboxInv[s] = x;

        // Compute MixColumns
        x8 = d[x4 = d[x2 = d[x]]];
        tDec = x8 * 0x1010101 ^ x4 * 0x10001 ^ x2 * 0x101 ^ x * 0x1010100;
        tEnc = d[s] * 0x101 ^ s * 0x1010100;

        for (i = 0; i < 4; i++) {
          encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
          decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8;
        }
      }

      // Compactify.  Considerable speedup on Firefox.
      for (i = 0; i < 5; i++) {
        encTable[i] = encTable[i].slice(0);
        decTable[i] = decTable[i].slice(0);
      }
    }

    /**
     * Encryption and decryption core.
     * @param {Array} input Four words to be encrypted or decrypted.
     * @param dir The direction, 0 for encrypt and 1 for decrypt.
     * @return {Array} The four encrypted or decrypted words.
     * @private
     */

  }, {
    key: '_crypt',
    value: function _crypt(input, dir) {
      if (input.length !== 4) {
        throw new Error('invalid aes block size');
      }

      var // state variables a,b,c,d are loaded with pre-whitened data
      key = this._key[dir];

      var a = input[0] ^ key[0];
      var b = input[dir ? 3 : 1] ^ key[1];
      var c = input[2] ^ key[2];
      var d = input[dir ? 1 : 3] ^ key[3];
      var a2 = void 0;
      var b2 = void 0;
      var c2 = void 0;
      var nInnerRounds = key.length / 4 - 2;
      var i = void 0;
      var kIndex = 4;
      var out = [0, 0, 0, 0];

      var // load up the tables
      table = this._tables[dir];

      var t0 = table[0];
      var t1 = table[1];
      var t2 = table[2];
      var t3 = table[3];
      var sbox = table[4];

      // Inner rounds.  Cribbed from OpenSSL.
      for (i = 0; i < nInnerRounds; i++) {
        a2 = t0[a >>> 24] ^ t1[b >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d & 255] ^ key[kIndex];
        b2 = t0[b >>> 24] ^ t1[c >> 16 & 255] ^ t2[d >> 8 & 255] ^ t3[a & 255] ^ key[kIndex + 1];
        c2 = t0[c >>> 24] ^ t1[d >> 16 & 255] ^ t2[a >> 8 & 255] ^ t3[b & 255] ^ key[kIndex + 2];
        d = t0[d >>> 24] ^ t1[a >> 16 & 255] ^ t2[b >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
        kIndex += 4;
        a = a2;b = b2;c = c2;
      }

      // Last round.
      for (i = 0; i < 4; i++) {
        out[dir ? 3 & -i : i] = sbox[a >>> 24] << 24 ^ sbox[b >> 16 & 255] << 16 ^ sbox[c >> 8 & 255] << 8 ^ sbox[d & 255] ^ key[kIndex++];
        a2 = a;a = b;b = c;c = d;d = a2;
      }

      return out;
    }
  }]);
  return AES;
}();

/**
 * The expanded S-box and inverse S-box tables.  These will be computed
 * on the client so that we don't have to send them down the wire.
 *
 * There are two tables, _tables[0] is for encryption and
 * _tables[1] is for decryption.
 *
 * The first 4 sub-tables are the expanded S-box with MixColumns.  The
 * last (_tables[01][4]) is the S-box itself.
 *
 * @private
 */


AES$1.prototype._tables = [[[], [], [], [], []], [[], [], [], [], []]];

function simpleEncryptAES(key, plaintext) {
  return new AES$1(key).encrypt(plaintext);
}

var AES$$1 = function () {
  function AES$$1(key) {
    classCallCheck(this, AES$$1);

    var a32 = [];
    for (var i = 0; i < 4; i++) {
      a32[i] = key.readInt32BE(i * 4);
    }
    this.aes = new AES$1(a32);
    this.key = key;
  }

  createClass(AES$$1, [{
    key: 'encryptCBC',
    value: function encryptCBC(buffer) {
      var iv = Buffer.alloc(16, 0);
      var decipher = crypto.createCipheriv('aes-128-cbc', this.key, iv);
      decipher.setAutoPadding(false);

      var result = Buffer.concat([decipher.update(buffer), decipher.final()]);
      result.copy(buffer);
      return result;
    }
  }, {
    key: 'decryptCBC',
    value: function decryptCBC(buffer) {
      var iv = Buffer.alloc(16, 0);
      var decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv);
      decipher.setAutoPadding(false);

      var result = Buffer.concat([decipher.update(buffer), decipher.final()]);
      result.copy(buffer);
      return result;
    }
  }, {
    key: 'stringhash',
    value: function stringhash(buffer) {
      var h32 = [0, 0, 0, 0];
      for (var i = 0; i < buffer.length; i += 4) {
        h32[i / 4 & 3] ^= buffer.readInt32BE(i, true);
      }

      for (var _i = 16384; _i !== 0; _i--) {
        h32 = this.aes.encrypt(h32);
      }

      var b = new Buffer(8);
      b.writeInt32BE(h32[0], 0, true);
      b.writeInt32BE(h32[2], 4, true);
      return b;
    }
  }, {
    key: 'decryptECB',
    value: function decryptECB(buffer) {
      var iv = Buffer.alloc(16, 0);
      var decipher = crypto.createDecipheriv('aes-128-ecb', this.key, iv);
      decipher.setAutoPadding(false);

      var result = Buffer.concat([decipher.update(buffer), decipher.final()]);
      result.copy(buffer);
      return result;
    }
  }, {
    key: 'encryptECB',
    value: function encryptECB(buffer) {
      var iv = Buffer.alloc(16, 0);
      var decipher = crypto.createCipheriv('aes-128-ecb', this.key, iv);
      decipher.setAutoPadding(false);

      var result = Buffer.concat([decipher.update(buffer), decipher.final()]);
      result.copy(buffer);
      return result;
    }
  }]);
  return AES$$1;
}();

var CTR = function (_EventEmitter) {
  inherits(CTR, _EventEmitter);

  function CTR(aes, nonce) {
    classCallCheck(this, CTR);

    var _this = possibleConstructorReturn(this, (CTR.__proto__ || Object.getPrototypeOf(CTR)).call(this));

    _this.aes = aes.aes;
    _this.nonce = nonce;

    _this.posNext = _this.increment = 131072; // 2**17
    _this.pos = 0;

    _this.encrypt = _this._process.bind(_this, true);
    _this.decrypt = _this._process.bind(_this, false);

    _this.ctr = [_this.nonce[0], _this.nonce[1], 0, 0];
    _this.mac = [_this.ctr[0], _this.ctr[1], _this.ctr[0], _this.ctr[1]];

    _this.macs = [];

    _this.on('mac', function (m) {
      _this.macs.push(m);
    });
    return _this;
  }

  createClass(CTR, [{
    key: 'condensedMac',
    value: function condensedMac() {
      if (this.mac) {
        this.macs.push(this.mac);
        this.mac = undefined;
      }
      var i = void 0;
      var j = void 0;
      var mac = [0, 0, 0, 0];

      for (i = 0; i < this.macs.length; i++) {
        for (j = 0; j < 4; j++) {
          mac[j] ^= this.macs[i][j];
        }mac = this.aes.encrypt(mac);
      }
      return mac;
    }
  }, {
    key: '_process',
    value: function _process(encrypt, buffer) {
      for (var i = 0; i < buffer.length; i += 16) {
        var d = [];
        var enc = void 0;

        if (encrypt) {
          d[0] = buffer.readInt32BE(i, true);
          d[1] = buffer.readInt32BE(i + 4, true);
          d[2] = buffer.readInt32BE(i + 8, true);
          d[3] = buffer.readInt32BE(i + 12, true);

          // compute MAC
          this.mac[0] ^= d[0];
          this.mac[1] ^= d[1];
          this.mac[2] ^= d[2];
          this.mac[3] ^= d[3];
          this.mac = this.aes.encrypt(this.mac);

          // encrypt using CTR
          enc = this.aes.encrypt(this.ctr);
          buffer.writeInt32BE(d[0] ^ enc[0], i, true);
          buffer.writeInt32BE(d[1] ^ enc[1], i + 4, true);
          buffer.writeInt32BE(d[2] ^ enc[2], i + 8, true);
          buffer.writeInt32BE(d[3] ^ enc[3], i + 12, true);
        } else {
          enc = this.aes.encrypt(this.ctr);

          d[0] = buffer.readInt32BE(i, true) ^ enc[0];
          d[1] = buffer.readInt32BE(i + 4, true) ^ enc[1];
          d[2] = buffer.readInt32BE(i + 8, true) ^ enc[2];
          d[3] = buffer.readInt32BE(i + 12, true) ^ enc[3];

          buffer.writeInt32BE(d[0], i, true);
          buffer.writeInt32BE(d[1], i + 4, true);
          buffer.writeInt32BE(d[2], i + 8, true);
          buffer.writeInt32BE(d[3], i + 12, true);

          this.mac[0] ^= buffer.readInt32BE(i, true);
          this.mac[1] ^= buffer.readInt32BE(i + 4, true);
          this.mac[2] ^= buffer.readInt32BE(i + 8, true);
          this.mac[3] ^= buffer.readInt32BE(i + 12, true);

          this.mac = this.aes.encrypt(this.mac);
        }

        if (!++this.ctr[3]) this.ctr[2]++;

        this.pos += 16;
        if (this.pos >= this.posNext) {
          this.emit('mac', this.mac);
          this.ctr[2] = this.pos / 0x1000000000 >>> 0;
          this.ctr[3] = this.pos / 0x10 >>> 0;
          this.mac = [this.ctr[0], this.ctr[1], this.ctr[0], this.ctr[1]];
          if (this.increment < 1048576) this.increment += 131072;
          this.posNext += this.increment;
        }
      }
    }
  }]);
  return CTR;
}(events.EventEmitter);

function formatKey(key) {
  return typeof key === 'string' ? d64(key) : key;
}

// URL Safe Base64 encode/decode
function e64(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function d64(s) {
  s += '=='.substr(2 - s.length * 3 & 3);
  s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, '');
  return new Buffer(s, 'base64');
}
function getCipher(key) {
  // 256 -> 128
  var k = new Buffer(16);
  for (var i = 0; i < 16; i++) {
    k.writeUInt8(key.readUInt8(i) ^ key.readUInt8(i + 16, true), i);
  }
  return new AES$$1(k);
}

// convert user-supplied password array
function prepareKey(a) {
  var i = void 0,
      j = void 0,
      r = void 0;
  var pkey = [0x93C467E3, 0x7DB0C7A4, 0xD1BE3F81, 0x0152CB56];
  for (r = 65536; r--;) {
    for (j = 0; j < a.length; j += 16) {
      key = [0, 0, 0, 0];

      for (i = 0; i < 16; i += 4) {
        if (i + j < a.length) {
          key[i / 4] = a.readInt32BE(i + j, true);
        }
      }
      pkey = simpleEncryptAES(key, pkey);
    }
  }
  var key = new Buffer(16);
  for (i = 0; i < 4; i++) {
    key.writeInt32BE(pkey[i], i * 4, true);
  }return key;
}

function megaEncrypt(key) {
  key = formatKey(key);

  if (!key) {
    key = secureRandom(24);
  }
  if (!(key instanceof Buffer)) {
    key = new Buffer(key);
  }

  var stream = through(write, end);

  if (key.length !== 24) {
    return process.nextTick(function () {
      stream.emit('error', Error('Wrong key length. Key must be 192bit.'));
    });
  }

  var aes = new AES$$1(key.slice(0, 16));
  var ctr = new CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)]);

  function write(d) {
    ctr.encrypt(d);
    this.emit('data', d);
  }

  function end() {
    var mac = ctr.condensedMac();
    var newkey = new Buffer(32);
    key.copy(newkey);
    newkey.writeInt32BE(mac[0] ^ mac[1], 24);
    newkey.writeInt32BE(mac[2] ^ mac[3], 28);
    for (var i = 0; i < 16; i++) {
      newkey.writeUInt8(newkey.readUInt8(i) ^ newkey.readUInt8(16 + i), i);
    }
    stream.key = newkey;
    this.emit('end');
  }

  stream = pipeline(chunkSizeSafe(16), stream);
  return stream;
}

function megaDecrypt(key) {
  key = formatKey(key);

  var stream = through(write, end);

  var aes = getCipher(key);
  var ctr = new CTR(aes, [key.readInt32BE(16), key.readInt32BE(20)]);

  function write(d) {
    ctr.decrypt(d);
    this.emit('data', d);
  }

  function end() {
    var mac = ctr.condensedMac();
    if ((mac[0] ^ mac[1]) !== key.readInt32BE(24) || (mac[2] ^ mac[3]) !== key.readInt32BE(28)) {
      return this.emit('error', new Error('MAC verification failed'));
    }
    this.emit('end');
  }

  return pipeline(chunkSizeSafe(16), stream);
}



var crypto$1 = Object.freeze({
	AES: AES$$1,
	CTR: CTR,
	formatKey: formatKey,
	e64: e64,
	d64: d64,
	getCipher: getCipher,
	prepareKey: prepareKey,
	megaEncrypt: megaEncrypt,
	megaDecrypt: megaDecrypt
});

/* RSA public key encryption/decryption
 * The following functions are (c) 2000 by John M Hanna and are
 * released under the terms of the Gnu Public License.
 * You must freely redistribute them with their source -- see the
 * GPL for details.
 *  -- Latest version found at http://sourceforge.net/projects/shop-js
 *
 * Modifications and GnuPG multi precision integer (mpi) conversion added
 * 2004 by Herbert Hanewinkel, www.haneWIN.de
 */

// The original script assumes `this` to be a object (like `window`)
// Then `this` was replaced with `globalState`
var globalState = {};

// --- Arbitrary Precision Math ---
// badd(a,b), bsub(a,b), bsqr(a), bmul(a,b)
// bdiv(a,b), bmod(a,b), bexpmod(g,e,m), bmodexp(g,e,m)

// bs is the shift, bm is the mask
// set single precision bits to 28
var bs = 28;
var bx2 = 1 << bs;
var bm = bx2 - 1;
var bd = bs >> 1;
var bdm = (1 << bd) - 1;

var log2 = Math.log(2);

function zeros(n) {
  var r = [];

  while (n-- > 0) {
    r[n] = 0;
  }return r;
}

function zclip(r) {
  var n = r.length;
  if (r[n - 1]) return r;
  while (n > 1 && r[n - 1] === 0) {
    n--;
  }return r.slice(0, n);
}

// returns bit length of integer x
function nbits(x) {
  var n = 1;
  var t = void 0;
  if ((t = x >>> 16) !== 0) {
    x = t;n += 16;
  }
  if ((t = x >> 8) !== 0) {
    x = t;n += 8;
  }
  if ((t = x >> 4) !== 0) {
    x = t;n += 4;
  }
  if ((t = x >> 2) !== 0) {
    x = t;n += 2;
  }
  if ((t = x >> 1) !== 0) {
    x = t;n += 1;
  }
  return n;
}

function badd(a, b) {
  var al = a.length;
  var bl = b.length;

  if (al < bl) return badd(b, a);

  var r = [];
  var c = 0;
  var n = 0;

  for (; n < bl; n++) {
    c += a[n] + b[n];
    r[n] = c & bm;
    c >>>= bs;
  }
  for (; n < al; n++) {
    c += a[n];
    r[n] = c & bm;
    c >>>= bs;
  }
  if (c) r[n] = c;
  return r;
}

function bsub(a, b) {
  var al = a.length;
  var bl = b.length;

  if (bl > al) return [];
  if (bl === al) {
    if (b[bl - 1] > a[bl - 1]) return [];
    if (bl === 1) return [a[0] - b[0]];
  }

  var r = [];
  var c = 0;
  var n = void 0;

  for (n = 0; n < bl; n++) {
    c += a[n] - b[n];
    r[n] = c & bm;
    c >>= bs;
  }
  for (; n < al; n++) {
    c += a[n];
    r[n] = c & bm;
    c >>= bs;
  }
  if (c) return [];

  return zclip(r);
}

function ip(w, n, x, y, c) {
  var xl = x & bdm;
  var xh = x >> bd;

  var yl = y & bdm;
  var yh = y >> bd;

  var m = xh * yl + yh * xl;
  var l = xl * yl + ((m & bdm) << bd) + w[n] + c;
  w[n] = l & bm;
  c = xh * yh + (m >> bd) + (l >> bs);
  return c;
}

// Multiple-precision squaring, HAC Algorithm 14.16

function bsqr(x) {
  var t = x.length;
  var n = 2 * t;
  var r = zeros(n);
  var c = 0;
  var i = void 0,
      j = void 0;

  for (i = 0; i < t; i++) {
    c = ip(r, 2 * i, x[i], x[i], 0);
    for (j = i + 1; j < t; j++) {
      c = ip(r, i + j, 2 * x[j], x[i], c);
    }
    r[i + t] = c;
  }

  return zclip(r);
}

// Multiple-precision multiplication, HAC Algorithm 14.12

function bmul(x, y) {
  var n = x.length;
  var t = y.length;
  var r = zeros(n + t - 1);
  var c = void 0,
      i = void 0,
      j = void 0;

  for (i = 0; i < t; i++) {
    c = 0;
    for (j = 0; j < n; j++) {
      c = ip(r, i + j, x[j], y[i], c);
    }
    r[i + n] = c;
  }

  return zclip(r);
}

function toppart(x, start, len) {
  var n = 0;
  while (start >= 0 && len-- > 0) {
    n = n * bx2 + x[start--];
  }return n;
}

// Multiple-precision division, HAC Algorithm 14.20

function bdiv(a, b) {
  var n = a.length - 1;
  var t = b.length - 1;
  var nmt = n - t;
  var x = void 0,
      y = void 0,
      qq = void 0,
      xx = void 0;

  // trivial cases; a < b
  if (n < t || n === t && (a[n] < b[n] || n > 0 && a[n] === b[n] && a[n - 1] < b[n - 1])) {
    globalState.q = [0];
    globalState.mod = a;
    return globalState;
  }

  // trivial cases; q < 4
  if (n === t && toppart(a, t, 2) / toppart(b, t, 2) < 4) {
    x = a.concat();
    qq = 0;
    xx;
    for (;;) {
      xx = bsub(x, b);
      if (xx.length === 0) break;
      x = xx;qq++;
    }
    globalState.q = [qq];
    globalState.mod = x;
    return globalState;
  }

  // normalize
  var shift2 = Math.floor(Math.log(b[t]) / log2) + 1;
  var shift = bs - shift2;

  x = a.concat();
  y = b.concat();

  if (shift) {
    for (i = t; i > 0; i--) {
      y[i] = y[i] << shift & bm | y[i - 1] >> shift2;
    }y[0] = y[0] << shift & bm;
    if (x[n] & (bm << shift2 & bm)) {
      x[++n] = 0;nmt++;
    }
    for (i = n; i > 0; i--) {
      x[i] = x[i] << shift & bm | x[i - 1] >> shift2;
    }x[0] = x[0] << shift & bm;
  }

  var i = void 0,
      x2 = void 0;
  var q = zeros(nmt + 1);
  var y2 = zeros(nmt).concat(y);
  for (;;) {
    x2 = bsub(x, y2);
    if (x2.length === 0) break;
    q[nmt]++;
    x = x2;
  }

  var yt = y[t];
  var top = toppart(y, t, 2);
  var m = void 0;
  for (i = n; i > t; i--) {
    m = i - t - 1;
    if (i >= x.length) {
      q[m] = 1;
    } else if (x[i] === yt) {
      q[m] = bm;
    } else {
      q[m] = Math.floor(toppart(x, i, 2) / yt);
    }

    var topx = toppart(x, i, 3);
    while (q[m] * top > topx) {
      q[m]--;
    } // x-=q[m]*y*b^m
    y2 = y2.slice(1);
    x2 = bsub(x, bmul([q[m]], y2));
    if (x2.length === 0) {
      q[m]--;
      x2 = bsub(x, bmul([q[m]], y2));
    }
    x = x2;
  }
  // de-normalize
  if (shift) {
    for (i = 0; i < x.length - 1; i++) {
      x[i] = x[i] >> shift | x[i + 1] << shift2 & bm;
    }x[x.length - 1] >>= shift;
  }

  globalState.q = zclip(q);
  globalState.mod = zclip(x);
  return globalState;
}

// returns the mod where m < 2^bd
function simplemod(i, m) {
  var c = 0;
  var v = void 0;
  for (var n = i.length - 1; n >= 0; n--) {
    v = i[n];
    c = ((v >> bd) + (c << bd)) % m;
    c = ((v & bdm) + (c << bd)) % m;
  }
  return c;
}

function bmod(p, m) {
  if (m.length === 1) {
    if (p.length === 1) return [p[0] % m[0]];
    if (m[0] < bdm) return [simplemod(p, m[0])];
  }

  var r = bdiv(p, m);
  return r.mod;
}

// Barrett's modular reduction, HAC Algorithm 14.42

function bmod2(x, m, mu) {
  var xl = x.length - (m.length << 1);
  if (xl > 0) return bmod2(x.slice(0, xl).concat(bmod2(x.slice(xl), m, mu)), m, mu);

  var ml1 = m.length + 1;
  var ml2 = m.length - 1;
  var rr = void 0;
  var q3 = bmul(x.slice(ml2), mu).slice(ml1);
  var r1 = x.slice(0, ml1);
  var r2 = bmul(q3, m).slice(0, ml1);
  var r = bsub(r1, r2);

  if (r.length === 0) {
    r1[ml1] = 1;
    r = bsub(r1, r2);
  }
  for (var n = 0;; n++) {
    rr = bsub(r, m);
    if (rr.length === 0) break;
    r = rr;
    if (n >= 3) return bmod2(r, m, mu);
  }
  return r;
}

// Modular exponentiation using Barrett reduction

function bmodexp(g, e, m) {
  var a = g.concat();
  var l = e.length - 1;
  var n = m.length * 2;
  var mu = zeros(n + 1);
  mu[n] = 1;
  mu = bdiv(mu, m).q;

  n = nbits(e[l]) - 2;

  for (; l >= 0; l--) {
    for (; n >= 0; n -= 1) {
      a = bmod2(bsqr(a), m, mu);
      if (e[l] & 1 << n) a = bmod2(bmul(a, g), m, mu);
    }
    n = bs - 1;
  }
  return a;
}

// Compute m**d mod p*q for RSA private key operations.

function RSAdecrypt(m, d, p, q, u) {
  var xp = bmodexp(bmod(m, p), bmod(d, bsub(p, [1])), p);
  var xq = bmodexp(bmod(m, q), bmod(d, bsub(q, [1])), q);

  var t = bsub(xq, xp);
  if (t.length === 0) {
    t = bsub(xp, xq);
    t = bmod(bmul(t, u), q);
    t = bsub(q, t);
  } else {
    t = bmod(bmul(t, u), q);
  }
  return badd(bmul(t, p), xp);
}

// -----------------------------------------------------------------
// conversion functions: num array <-> multi precision integer (mpi)
// mpi: 2 octets with length in bits + octets in big endian order

function mpi2b(s) {
  var bn = 1;
  var r = [0];
  var rn = 0;
  var sb = 256;
  var sn = s.length;
  var c = void 0;

  if (sn < 2) return 0;

  var len = (sn - 2) * 8;
  var bits = s.charCodeAt(0) * 256 + s.charCodeAt(1);
  if (bits > len || bits < len - 8) return 0;

  for (var n = 0; n < len; n++) {
    if ((sb <<= 1) > 255) {
      sb = 1;
      c = s.charCodeAt(--sn);
    }
    if (bn > bm) {
      bn = 1;
      r[++rn] = 0;
    }
    if (c & sb) r[rn] |= bn;
    bn <<= 1;
  }
  return r;
}

function b2s(b) {
  var bn = 1;
  var bc = 0;
  var r = [0];
  var rb = 1;
  var rn = 0;
  var bits = b.length * bs;
  var rr = '';
  var n = void 0;

  for (n = 0; n < bits; n++) {
    if (b[bc] & bn) r[rn] |= rb;
    if ((rb <<= 1) > 255) {
      rb = 1;
      r[++rn] = 0;
    }
    if ((bn <<= 1) > bm) {
      bn = 1;
      bc++;
    }
  }

  while (rn >= 0 && r[rn] === 0) {
    rn--;
  }for (n = 0; n <= rn; n++) {
    rr = String.fromCharCode(r[n]) + rr;
  }return rr;
}

/**
 * cryptoDecodePrivKey
 * @public
 * @argv privk Buffer Private key
 * @return Private Key
 * @source https://github.com/meganz/webclient/blob/542d98ec61340b1e4fbf0dae0ae457c1bc5d49aa/js/crypto.js#L1448
 */
function cryptoDecodePrivKey(privk) {
  var pubkey = [];
  var l = (privk[0] * 256 + privk[1] + 7 >> 3) + 2;

  // decompose private key
  for (var i = 0; i < 4; i++) {
    pubkey[i] = mpi2b(privk.toString('binary').substr(0, l));
    if (typeof pubkey[i] === 'number') {
      if (i !== 4 || privk.length >= 16) return false;
      break;
    }
    privk = privk.slice(l);
  }

  return pubkey;
}

/**
 * cryptoRsaDecrypt
 * @public
 * @argv ciphertext Buffer
 * @argv privkey Private Key
 * @return Buffer Decrypted plaintext
 * @source https://github.com/meganz/webclient/blob/4d95863d2cdbfb7652d16acdff8bae4b64056549/js/crypto.js#L1468
 */
function cryptoRsaDecrypt(ciphertext, privkey) {
  var integerCiphertext = mpi2b(ciphertext.toString('binary'));
  var plaintext = b2s(RSAdecrypt(integerCiphertext, privkey[2], privkey[0], privkey[1], privkey[3]));
  return new Buffer(plaintext, 'binary');
}

var MAX_RETRIES = 4;
var ERRORS = {
  1: 'EINTERNAL (-1): An internal error has occurred. Please submit a bug report, detailing the exact circumstances in which this error occurred.',
  2: 'EARGS (-2): You have passed invalid arguments to this command.',
  3: 'EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retried ' + MAX_RETRIES + ' times.',
  4: 'ERATELIMIT (-4): You have exceeded your command weight per time quota. Please wait a few seconds, then try again (this should never happen in sane real-life applications).',
  5: 'EFAILED (-5): The upload failed. Please restart it from scratch.',
  6: 'ETOOMANY (-6): Too many concurrent IP addresses are accessing this upload target URL.',
  7: 'ERANGE (-7): The upload file packet is out of range or not starting and ending on a chunk boundary.',
  8: 'EEXPIRED (-8): The upload target URL you are trying to access has expired. Please request a fresh one.',
  9: 'ENOENT (-9): Object (typically, node or user) not found. Wrong password?',
  10: 'ECIRCULAR (-10): Circular linkage attempted',
  11: 'EACCESS (-11): Access violation (e.g., trying to write to a read-only share)',
  12: 'EEXIST (-12): Trying to create an object that already exists',
  13: 'EINCOMPLETE (-13): Trying to access an incomplete resource',
  14: 'EKEY (-14): A decryption operation failed (never returned by the API)',
  15: 'ESID (-15): Invalid or expired user session, please relogin',
  16: 'EBLOCKED (-16): User blocked',
  17: 'EOVERQUOTA (-17): Request over quota',
  18: 'ETEMPUNAVAIL (-18): Resource temporarily not available, please try again later'
};

var API = function (_EventEmitter) {
  inherits(API, _EventEmitter);

  function API(keepalive) {
    classCallCheck(this, API);

    var _this = possibleConstructorReturn(this, (API.__proto__ || Object.getPrototypeOf(API)).call(this));

    _this.keepalive = keepalive;
    _this.counterId = Math.random().toString().substr(2, 10);
    return _this;
  }

  createClass(API, [{
    key: 'request',
    value: function request(json, cb) {
      var _this2 = this;

      var retryno = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

      var qs = { id: (this.counterId++).toString() };
      if (this.sid) {
        qs.sid = this.sid;
      }
      if (_typeof(json.qs) === 'object') {
        Object.assign(qs, json.qs);
        delete json.qs;
      }
      _request({
        uri: API.gateway + 'cs',
        qs: qs,
        method: 'POST',
        json: [json]
      }, function (err, req, resp) {
        if (err) return cb(err);

        if (!resp) return cb(new Error('Empty response'));

        // Some error codes are returned as num, some as array with number.
        if (resp.length) resp = resp[0];

        if (!err && typeof resp === 'number' && resp < 0) {
          if (resp === -3) {
            if (retryno < MAX_RETRIES) {
              return setTimeout(function () {
                _this2.request(json, cb, retryno + 1);
              }, Math.pow(2, retryno + 1) * 1e3);
            }
          }
          err = new Error(ERRORS[-resp]);
        } else {
          if (_this2.keepalive && resp && resp.sn) {
            _this2.pull(resp.sn);
          }
        }
        cb(err, resp);
      });
    }
  }, {
    key: 'pull',
    value: function pull(sn) {
      var _this3 = this;

      var retryno = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

      this.sn = _request({
        uri: API.gateway + 'sc',
        qs: { sn: sn, sid: this.sid },
        method: 'POST',
        json: true,
        body: 'sc?' + querystring.stringify({ sn: sn })
      }, function (err, req, resp) {
        _this3.sn = undefined;

        if (!err && typeof resp === 'number' && resp < 0) {
          if (resp === -3) {
            if (retryno < MAX_RETRIES) {
              return setTimeout(function () {
                _this3.pull(sn, retryno + 1);
              }, Math.pow(2, retryno + 1) * 1e3);
            }
          }
          err = new Error(ERRORS[-resp]);
        }
        if (err) throw err;

        if (resp.w) {
          _this3.wait(resp.w, sn);
        } else if (resp.sn) {
          if (resp.a) {
            _this3.emit('sc', resp.a);
          }
          _this3.pull(resp.sn);
        }
      });
    }
  }, {
    key: 'wait',
    value: function wait(url$$1, sn) {
      var _this4 = this;

      this.sn = _request({
        uri: url$$1,
        method: 'POST'
      }, function (err, req, body) {
        _this4.sn = undefined;
        if (err) throw Error('mega server wait req failed');

        _this4.pull(sn);
      });
    }
  }, {
    key: 'close',
    value: function close() {
      if (this.sn) this.sn.abort();
    }
  }]);
  return API;
}(events.EventEmitter);

API.gateway = 'https://g.api.mega.co.nz/';

var api = new API(false);

var File = function (_EventEmitter) {
  inherits(File, _EventEmitter);

  function File(opt, storage) {
    classCallCheck(this, File);

    var _this = possibleConstructorReturn(this, (File.__proto__ || Object.getPrototypeOf(File)).call(this));

    _this.downloadId = opt.downloadId;
    _this.key = opt.key ? formatKey(opt.key) : null;

    if (storage && opt.h) {
      _this.api = storage.api;
      _this.nodeId = opt.h;
      _this.timestamp = opt.ts;
      _this.type = opt.t;
      _this.directory = !!_this.type;

      if (opt.k) {
        _this._decryptAttributes(storage.aes, opt);
      }
    } else {
      _this.type = opt.directory ? 1 : 0;
      _this.directory = !!opt.directory;
    }
    return _this;
  }

  createClass(File, [{
    key: '_decryptAttributes',
    value: function _decryptAttributes(aes, opt) {
      this.size = opt.s || 0;
      this.timestamp = opt.ts || 0;
      this.type = opt.t;
      this.name = null;

      if (!aes || !opt.k) return;

      var parts = opt.k.split(':');
      this.key = formatKey(parts[parts.length - 1]);
      aes.decryptKey(this.key);
      if (opt.a) {
        this._setAttributes(opt.a);
      }
    }
  }, {
    key: '_setAttributes',
    value: function _setAttributes(at) {
      var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : function () {};

      at = d64(at);
      getCipher(this.key).decryptCBC(at);

      try {
        at = File.unpackAttributes(at);
      } catch (e) {
        return cb(e);
      }

      this.attributes = at;
      this.name = at.n;

      cb(null, this);

      return this;
    }
  }, {
    key: 'loadAttributes',
    value: function loadAttributes(cb) {
      var _this2 = this;

      var req = this.directory ? { a: 'f', qs: { n: this.downloadId } } : { a: 'g', p: this.downloadId }; // todo: nodeId version ('n')
      api.request(req, function (err, response) {
        if (err) return cb(err);

        if (_this2.directory) {
          var filesMap = new Map();
          var folder = response.f[0];
          var aes = _this2.key ? new AES$$1(_this2.key) : null;
          _this2.nodeId = folder.h;
          _this2.timestamp = folder.ts;
          filesMap.set(folder.h, _this2);

          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = response.f[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var file = _step.value;

              if (file.t === 0) {
                var parent = filesMap.get(file.p);
                if (!parent.children) parent.children = [];

                var fileObj = new File(file, _this2.storage);
                fileObj._decryptAttributes(aes, file);
                // is it the best way to handle this?
                fileObj.downloadId = [_this2.downloadId, file.h];
                parent.children.push(fileObj);
                file.parent = parent;
              }
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }

          _this2._decryptAttributes(aes, folder);
          cb(null, _this2);
        } else {
          _this2.size = response.s;
          _this2._setAttributes(response.at, cb);
        }
      });

      return this;
    }
  }, {
    key: 'download',
    value: function download(options, cb) {
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      if (!options) options = {};
      var maxConnections = options.maxConnections || 4;
      var initialChunkSize = options.initialChunkSize || 128 * 1024;
      var chunkSizeIncrement = options.chunkSizeIncrement || 128 * 1024;
      var maxChunkSize = options.maxChunkSize || 1024 * 1024;

      var req = { a: 'g', g: 1, ssl: 2 };
      if (this.nodeId) {
        req.n = this.nodeId;
      } else if (Array.isArray(this.downloadId)) {
        req.qs = { n: this.downloadId[0] };
        req.n = this.downloadId[1];
      } else {
        req.p = this.downloadId;
      }

      if (this.directory) throw Error("Can't download: folder download isn't supported");
      if (!this.key) throw Error("Can't download: key isn't defined");
      var stream = megaDecrypt(this.key);

      var cs = this.api || api;
      cs.request(req, function (err, response) {
        if (err) return stream.emit('error', err);
        if (typeof response.g !== 'string' || response.g.substr(0, 4) !== 'http') {
          return stream.emit('error', Error('MEGA servers returned an invalid response, maybe caused by rate limit'));
        }

        var activeStreams = 0;
        var currentOffset = 0;
        var chunkSize = initialChunkSize;
        var combined = CombinedStream.create();

        function getChunk() {
          var currentMax = Math.min(response.s, currentOffset + chunkSize);
          if (currentMax <= currentOffset) return;
          var r = _request(response.g + '/' + currentOffset + '-' + (currentMax - 1));

          r.on('end', getChunk);
          combined.append(r, { contentLength: currentMax - currentOffset });

          currentOffset = currentMax;
          if (chunkSize < maxChunkSize) {
            chunkSize = chunkSize + chunkSizeIncrement;
          }

          activeStreams += 1;
          if (activeStreams < maxConnections) {
            setTimeout(getChunk, 1000);
          }
        }

        getChunk();
        combined.pipe(stream);

        var i = 0;
        stream.on('data', function (d) {
          i += d.length;
          stream.emit('progress', { bytesLoaded: i, bytesTotal: response.s });
        });
      });

      if (cb) streamToCb(stream, cb);
      return stream;
    }
  }, {
    key: 'delete',
    value: function _delete(cb) {
      if (!this.nodeId) {
        return process.nextTick(function () {
          cb(new Error('delete is only supported on files with node ID-s'));
        });
      }
      this.api.request({ a: 'd', n: this.nodeId }, cb);

      return this;
    }
  }, {
    key: 'link',
    value: function link(noKey, cb) {
      var _this3 = this;

      if (arguments.length === 1 && typeof noKey === 'function') {
        cb = noKey;
        noKey = false;
      }
      if (!this.nodeId) {
        return process.nextTick(function () {
          cb(new Error('delete is only supported on files with node ID-s'));
        });
      }
      this.api.request({ a: 'l', n: this.nodeId }, function (err, id) {
        if (err) return cb(err);
        var url$$1 = 'https://mega.nz/#!' + id;
        if (!noKey && _this3.key) url$$1 += '!' + e64(_this3.key);
        cb(null, url$$1);
      });

      return this;
    }
  }]);
  return File;
}(events.EventEmitter);

File.packAttributes = function (attributes) {
  var at = JSON.stringify(attributes);
  at = new Buffer('MEGA' + at);
  var ret = new Buffer(Math.ceil(at.length / 16) * 16);
  ret.fill(0);
  at.copy(ret);
  return ret;
};

File.unpackAttributes = function (at) {
  // read until the first null byte
  var end = 0;
  while (end < at.length && at.readUInt8(end)) {
    end++;
  }at = at.slice(0, end).toString();
  if (at.substr(0, 6) !== 'MEGA{"') {
    throw new Error('Attributes could not be decrypted with provided key.');
  }

  return JSON.parse(at.substr(4).replace(/\0|[^}]*$/g, ''));
};

var Storage = function (_EventEmitter) {
  inherits(Storage, _EventEmitter);

  function Storage(options, cb) {
    classCallCheck(this, Storage);

    var _this = possibleConstructorReturn(this, (Storage.__proto__ || Object.getPrototypeOf(Storage)).call(this));

    if (arguments.length === 1 && typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (!cb) {
      cb = function cb(err) {
        // Would be nicer to emit error event?
        if (err) throw err;
      };
    }

    // Defaults
    options.keepalive = options.keepalive === undefined ? true : !!options.keepalive;
    options.autoload = options.autoload === undefined ? true : !!options.autoload;

    _this.api = new API(options.keepalive);
    _this.files = {};

    var ready = function ready() {
      _this.status = 'ready';
      cb(null, _this);
      _this.emit('ready', _this);
    };

    var loadUser = function loadUser(cb) {
      _this.api.request({ a: 'ug' }, function (err, response) {
        if (err) return cb(err);
        _this.name = response.name;
        _this.user = response.u;

        if (options.autoload) {
          _this.reload(function (err) {
            if (err) return cb(err);
            ready();
          }, true);
        } else {
          ready();
        }
      });
    };

    if (options.email) {
      (function () {
        _this.email = options.email;
        var pw = prepareKey(new Buffer(options.password));
        var aes = new AES$$1(pw);
        var uh = e64(aes.stringhash(new Buffer(options.email)));

        _this.api.request({ a: 'us', user: options.email, uh: uh }, function (err, response) {
          if (err) return cb(err);
          _this.key = formatKey(response.k);
          aes.decryptKey(_this.key);
          _this.aes = new AES$$1(_this.key);

          var t = formatKey(response.csid);
          var privk = _this.aes.decryptKey(formatKey(response.privk));
          var rsaPrivk = cryptoDecodePrivKey(privk);
          if (!rsaPrivk) throw Error('invalid credentials');

          var sid = e64(cryptoRsaDecrypt(t, rsaPrivk).slice(0, 43));

          _this.api.sid = _this.sid = sid;
          _this.RSAPrivateKey = rsaPrivk;

          loadUser(cb);
        });
      })();
    } else {
      throw Error('no credentials');
    }

    _this.status = 'connecting';
    return _this;
  }

  createClass(Storage, [{
    key: 'reload',
    value: function reload(cb, force) {
      var _this2 = this;

      if (this.status === 'connecting' && !force) {
        return this.once('ready', this.reload.bind(this, cb));
      }
      this.mounts = [];
      this.api.request({ a: 'f', c: 1 }, function (err, response) {
        if (err) return cb(err);
        response.f.forEach(_this2._importFile.bind(_this2));
        cb(null, _this2.mounts);
      });

      this.api.on('sc', function (arr) {
        var deleted = {};
        arr.forEach(function (o) {
          if (o.a === 'u') {
            var file = _this2.files[o.n];
            if (file) {
              file.timestamp = o.ts;
              file._setAttributes(o.at, function () {});
              file.emit('update');
              _this2.emit('update', file);
            }
          } else if (o.a === 'd') {
            deleted[o.n] = true; // Don't know yet if move or delete.
          } else if (o.a === 't') {
            o.t.f.forEach(function (f) {
              var file = _this2.files[f.h];
              if (file) {
                delete deleted[f.h];
                var oldparent = file.parent;
                if (oldparent.nodeId === f.p) return;
                // todo: move to setParent() to avoid duplicate.
                oldparent.children.splice(oldparent.children.indexOf(file), 1);
                file.parent = _this2.files[f.p];
                if (!file.parent.children) file.parent.children = [];
                file.parent.children.push(file);
                file.emit('move', oldparent);
                _this2.emit('move', file, oldparent);
              } else {
                _this2.emit('add', _this2._importFile(f));
              }
            });
          }
        });

        Object.keys(deleted).forEach(function (n) {
          var file = _this2.files[n];
          var parent = file.parent;
          parent.children.splice(parent.children.indexOf(file), 1);
          _this2.emit('delete', file);
          file.emit('delete');
        });
      });
    }
  }, {
    key: '_importFile',
    value: function _importFile(f) {
      // todo: no support for updates
      if (!this.files[f.h]) {
        var fo = this.files[f.h] = new File(f, this);
        if (f.t === Storage.NODE_TYPE_DRIVE) {
          this.root = fo;
          fo.name = 'Cloud Drive';
        }
        if (f.t === Storage.NODE_TYPE_RUBBISH_BIN) {
          this.trash = fo;
          fo.name = 'Rubbish Bin';
        }
        if (f.t === Storage.NODE_TYPE_INBOX) {
          this.inbox = fo;
          fo.name = 'Inbox';
        }
        if (f.t > 1) {
          this.mounts.push(fo);
        }
        if (f.p) {
          var parent = this.files[f.p];
          if (!parent.children) parent.children = [];
          parent.children.push(fo);
          fo.parent = parent;
        }
      }
      return this.files[f.h];
    }
  }, {
    key: 'mkdir',
    value: function mkdir(opt, cb) {
      var _this3 = this;

      if (typeof opt === 'string') {
        opt = { name: opt };
      }
      if (!opt.attributes) opt.attributes = {};
      if (opt.name) opt.attributes.n = opt.name;

      if (!opt.attributes.n) {
        return process.nextTick(function () {
          cb(new Error('File name is required.'));
        });
      }

      // Wait for ready event.
      if (this.status === 'connecting') {
        return this.on('ready', this.mkdir.bind(this, opt, cb));
      }

      if (!opt.target) opt.target = this.root;
      if (!opt.key) opt.key = secureRandom(32);

      var key = opt.key;
      var at = File.packAttributes(opt.attributes);

      getCipher(key).encryptCBC(at);
      this.aes.encryptECB(key);

      this.api.request({
        a: 'p',
        t: opt.target.nodeId ? opt.target.nodeId : opt.target,
        n: [{
          h: 'xxxxxxxx',
          t: 1,
          a: e64(at),
          k: e64(key)
        }]
      }, function (err, response) {
        if (err) return returnError(err);
        var file = _this3._importFile(response.f[0]);
        _this3.emit('add', file);

        if (cb) {
          cb(null, file);
        }
      });

      function returnError(e) {
        if (cb) cb(e);
      }
    }
  }, {
    key: 'upload',
    value: function upload(opt, buffer, cb) {
      var _this4 = this;

      if (arguments.length === 2 && typeof buffer === 'function') {
        cb = buffer;
        buffer = null;
      }

      if (typeof opt === 'string') {
        opt = { name: opt };
      }

      if (!opt.attributes) opt.attributes = {};
      if (opt.name) opt.attributes.n = opt.name;

      if (!opt.attributes.n) {
        throw new Error('File name is required.');
      }

      var encrypter = mega.encrypt();
      var pause = through().pause();
      var stream = pipeline(pause, encrypter);

      var returnError = function returnError(e) {
        if (cb) {
          cb(e);
        } else {
          stream.emit('error', e);
        }
      };

      // Size is needed before upload. Kills the streaming otherwise.
      var size = opt.size;
      if (buffer) {
        size = buffer.length;
        stream.write(buffer);
        stream.end();
      }

      var upload = function upload(size) {
        if (!opt.target) opt.target = _this4.root;

        _this4.api.request({ a: 'u', ssl: 0, ms: '-1', s: size, r: 0, e: 0 }, function (err, resp) {
          if (err) return returnError(err);

          var httpreq = _request({
            uri: resp.p,
            headers: { 'Content-Length': size },
            method: 'POST'
          });

          streamToCb(httpreq, function (err, hash) {
            if (err) return returnError(err);
            var key = encrypter.key;
            var at = File.packAttributes(opt.attributes);
            getCipher(key).encryptCBC(at);

            _this4.aes.encryptECB(key);

            _this4.api.request({
              a: 'p',
              t: opt.target.nodeId ? opt.target.nodeId : opt.target,
              n: [{
                h: hash.toString(),
                t: 0,
                a: e64(at),
                k: e64(key)
              }]
            }, function (err, response) {
              if (err) return returnError(err);
              var file = _this4._importFile(response.f[0]);
              _this4.emit('add', file);

              stream.emit('complete', file);

              if (cb) {
                cb(null, file);
              }
            });
          });

          var sizeCheck = 0;
          encrypter.on('data', function (d) {
            sizeCheck += d.length;
            stream.emit('progress', { bytesLoaded: sizeCheck, bytesTotal: size });
          });
          encrypter.on('end', function () {
            if (size && sizeCheck !== size) {
              return stream.emit('error', new Error('Specified data size does not match.'));
            }
          });

          encrypter.pipe(httpreq);
          pause.resume();
        });
      };

      // Wait for ready event.
      if (this.status === 'connecting') {
        (function () {
          var _upload = upload;
          upload = function upload(s) {
            _this4.on('ready', function () {
              _upload(s);
            });
          };
        })();
      }

      if (size) {
        upload(size);
      } else {
        stream = pipeline(detectSize(upload), stream);
      }

      return stream;
    }
  }, {
    key: 'close',
    value: function close() {
      // does not handle, if still connecting or incomplete streams.
      this.status = 'closed';
      this.api.close();
    }
  }]);
  return Storage;
}(events.EventEmitter);

Storage.NODE_TYPE_FILE = 0;
Storage.NODE_TYPE_DIR = 1;
Storage.NODE_TYPE_DRIVE = 2;
Storage.NODE_TYPE_INBOX = 3;
Storage.NODE_TYPE_RUBBISH_BIN = 4;

function mega() {
  for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  return new (Function.prototype.bind.apply(mega.Storage, [null].concat(args)))();
}

mega.Storage = Storage;

mega.File = File;

mega.file = function (opt) {
  if ((typeof opt === 'undefined' ? 'undefined' : _typeof(opt)) === 'object') {
    return new mega.File(opt);
  }

  var url$$1 = url.parse(opt);
  if (url$$1.hostname !== 'mega.nz' && url$$1.hostname !== 'mega.co.nz') throw Error('Wrong URL supplied: wrong hostname');
  if (!url$$1.hash) throw Error('Wrong URL supplied: no hash');

  var split = url$$1.hash.split('!');
  if (split.length <= 1) throw Error('Wrong URL supplied: too few arguments');
  if (split.length >= 4) throw Error('Wrong URL supplied: too many arguments');
  if (split[0] !== '#' && split[0] !== '#F') throw Error('Wrong URL supplied: not recognized');

  return new mega.File({
    downloadId: split[1],
    key: split[2],
    directory: split[0] === '#F'
  });
};

// backyards compatibility
mega.encrypt = megaEncrypt;
mega.decrypt = megaDecrypt;

// for testing
mega.crypto = crypto$1;

module.exports = mega;
