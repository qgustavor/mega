import through from 'through';
import crypto from 'crypto';
import pipeline from 'stream-combiner';
import secureRandom from 'secure-random';
import { EventEmitter } from 'events';
import request from 'request';
import querystring from 'querystring';
import CombinedStream from 'combined-stream';
import { parse } from 'url';
import { PassThrough } from 'stream';
import StreamSkip from 'stream-skip';

function streamToCb(stream, cb) {
  const chunks = [];
  let complete;
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
  let last;
  return through(function (d) {
    if (last) d = Buffer.concat([last, d]);
    const end = Math.floor(d.length / size) * size;

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
  const chunks = [];
  let size = 0;
  return through(d => {
    chunks.push(d);
    size += d.length;
  }, function () {
    // function IS needed
    cb(size);
    chunks.forEach(this.emit.bind(this, 'data'));
    this.emit('end');
  });
}

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

  return arr2;
}

function _createForOfIteratorHelper(o, allowArrayLike) {
  var it;

  if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) {
    if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
      if (it) o = it;
      var i = 0;

      var F = function () {};

      return {
        s: F,
        n: function () {
          if (i >= o.length) return {
            done: true
          };
          return {
            done: false,
            value: o[i++]
          };
        },
        e: function (e) {
          throw e;
        },
        f: F
      };
    }

    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }

  var normalCompletion = true,
      didErr = false,
      err;
  return {
    s: function () {
      it = o[Symbol.iterator]();
    },
    n: function () {
      var step = it.next();
      normalCompletion = step.done;
      return step;
    },
    e: function (e) {
      didErr = true;
      err = e;
    },
    f: function () {
      try {
        if (!normalCompletion && it.return != null) it.return();
      } finally {
        if (didErr) throw err;
      }
    }
  };
}

function prepareKey(password) {
  let i, j, r;
  let pkey = Buffer.from([147, 196, 103, 227, 125, 176, 199, 164, 209, 190, 63, 129, 1, 82, 203, 86]);

  for (r = 65536; r--;) {
    for (j = 0; j < password.length; j += 16) {
      const key = Buffer.alloc(16);

      for (i = 0; i < 16; i += 4) {
        if (i + j < password.length) {
          password.copy(key, i, i + j, i + j + 4);
        }
      }

      pkey = crypto.createCipheriv('aes-128-ecb', key, Buffer.alloc(0)).setAutoPadding(false).update(pkey);
    }
  }

  return pkey;
} // The same function but for version 2 accounts

function prepareKeyV2(password, info, cb) {
  const salt = Buffer.from(info.s, 'base64');
  const iterations = 100000;
  const digest = 'sha512';
  crypto.pbkdf2(password, salt, iterations, 32, digest, cb);
}

class AES {
  constructor(key) {
    if (key.length !== 16) throw Error('Wrong key length. Key must be 128bit.');
    this.key = key;
  }

  encryptCBC(buffer) {
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-cbc', this.key, iv).setAutoPadding(false);
    const result = Buffer.concat([cipher.update(buffer), cipher.final()]);
    result.copy(buffer);
    return result;
  }

  decryptCBC(buffer) {
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-128-cbc', this.key, iv).setAutoPadding(false);
    const result = Buffer.concat([decipher.update(buffer), decipher.final()]);
    result.copy(buffer);
    return result;
  }

  stringhash(buffer) {
    const h32 = [0, 0, 0, 0];

    for (let i = 0; i < buffer.length; i += 4) {
      if (buffer.length - i < 4) {
        const len = buffer.length - i;
        h32[i / 4 & 3] ^= buffer.readIntBE(i, len) << (4 - len) * 8;
      } else {
        h32[i / 4 & 3] ^= buffer.readInt32BE(i);
      }
    }

    let hash = Buffer.allocUnsafe(16);

    for (let i = 0; i < 4; i++) {
      hash.writeInt32BE(h32[i], i * 4, true);
    }

    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0));

    for (let i = 16384; i--;) hash = cipher.update(hash);

    const result = Buffer.allocUnsafe(8);
    hash.copy(result, 0, 0, 4);
    hash.copy(result, 4, 8, 12);
    return result;
  }

  encryptECB(buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0)).setAutoPadding(false);
    const result = cipher.update(buffer);
    result.copy(buffer);
    return result;
  }

  decryptECB(buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, Buffer.alloc(0)).setAutoPadding(false);
    const result = decipher.update(buffer);
    result.copy(buffer);
    return result;
  }

}

class CTR {
  constructor(aes, nonce, start = 0) {
    this.key = aes.key;
    this.nonce = nonce.slice(0, 8);
    const iv = Buffer.alloc(16);
    this.nonce.copy(iv, 0);

    if (start !== 0) {
      this.incrementCTRBuffer(iv, start / 16);
    } // create ciphers on demand


    this.encrypt = buffer => {
      this.encryptCipher = crypto.createCipheriv('aes-128-ctr', this.key, iv);
      this.encrypt = this._encrypt;
      return this.encrypt(buffer);
    };

    this.decrypt = buffer => {
      this.decryptCipher = crypto.createDecipheriv('aes-128-ctr', this.key, iv);
      this.decrypt = this._decrypt;
      return this.decrypt(buffer);
    }; // MEGA's MAC implementation is... strange


    this.macCipher = crypto.createCipheriv('aes-128-ecb', this.key, Buffer.alloc(0));
    this.posNext = this.increment = 131072; // 2**17

    this.pos = 0;
    this.macs = [];
    this.mac = Buffer.alloc(16);
    this.nonce.copy(this.mac, 0);
    this.nonce.copy(this.mac, 8);
  }

  condensedMac() {
    if (this.mac) {
      this.macs.push(this.mac);
      this.mac = undefined;
    }

    let mac = Buffer.alloc(16, 0);

    var _iterator = _createForOfIteratorHelper(this.macs),
        _step;

    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        let item = _step.value;

        for (let j = 0; j < 16; j++) mac[j] ^= item[j];

        mac = this.macCipher.update(mac);
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }

    const macBuffer = Buffer.allocUnsafe(8);
    macBuffer.writeInt32BE(mac.readInt32BE(0) ^ mac.readInt32BE(4), 0);
    macBuffer.writeInt32BE(mac.readInt32BE(8) ^ mac.readInt32BE(12), 4);
    return macBuffer;
  }

  _encrypt(buffer) {
    for (let i = 0; i < buffer.length; i += 16) {
      for (let j = 0; j < 16; j++) this.mac[j] ^= buffer[i + j];

      this.mac = this.macCipher.update(this.mac);
      this.checkMacBounding();
    }

    return this.encryptCipher.update(buffer).copy(buffer);
  }

  _decrypt(buffer) {
    this.decryptCipher.update(buffer).copy(buffer);

    for (let i = 0; i < buffer.length; i += 16) {
      for (let j = 0; j < 16; j++) this.mac[j] ^= buffer[i + j];

      this.mac = this.macCipher.update(this.mac);
      this.checkMacBounding();
    }

    return buffer;
  }

  checkMacBounding() {
    this.pos += 16;

    if (this.pos >= this.posNext) {
      this.macs.push(Buffer.from(this.mac));
      this.nonce.copy(this.mac, 0);
      this.nonce.copy(this.mac, 8);

      if (this.increment < 1048576) {
        this.increment += 131072;
      }

      this.posNext += this.increment;
    }
  } // From https://github.com/jrnewell/crypto-aes-ctr/blob/77156490fcf32870215680c8db035c01390144b2/lib/index.js#L4-L18


  incrementCTRBuffer(buf, cnt) {
    const len = buf.length;
    let i = len - 1;
    let mod;

    while (cnt !== 0) {
      mod = (cnt + buf[i]) % 256;
      cnt = Math.floor((cnt + buf[i]) / 256);
      buf[i] = mod;
      i -= 1;

      if (i < 0) {
        i = len - 1;
      }
    }
  }

}

function formatKey(key) {
  return typeof key === 'string' ? d64(key) : key;
} // URL Safe Base64 encode/decode

function e64(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function d64(s) {
  return Buffer.from(s, 'base64');
}
function getCipher(key) {
  return new AES(unmergeKeyMac(key).slice(0, 16));
}

function megaEncrypt(key, options = {}) {
  const start = options.start || 0;

  if (start !== 0) {
    throw Error('Encryption cannot start midstream otherwise MAC verification will fail.');
  }

  key = formatKey(key);

  if (!key) {
    key = secureRandom(24);
  }

  if (!(key instanceof Buffer)) {
    key = Buffer.from(key);
  }

  let stream = through(write, end);

  if (key.length !== 24) {
    return process.nextTick(() => {
      stream.emit('error', Error('Wrong key length. Key must be 192bit.'));
    });
  }

  const aes = new AES(key.slice(0, 16));
  const ctr = new CTR(aes, key.slice(16), start);

  function write(d) {
    ctr.encrypt(d);
    this.emit('data', d);
  }

  function end() {
    const mac = ctr.condensedMac();
    stream.key = mergeKeyMac(key, mac);
    this.emit('end');
  }

  stream = pipeline(chunkSizeSafe(16), stream);
  return stream;
}

function megaDecrypt(key, options = {}) {
  const start = options.start || 0;
  if (start !== 0) options.disableVerification = true;
  if (start % 16 !== 0) throw Error('start argument of megaDecrypt must be a multiple of 16');
  key = formatKey(key);
  let stream = through(write, end);
  const aes = getCipher(key);
  const ctr = new CTR(aes, key.slice(16), start);

  function write(d) {
    ctr.decrypt(d);
    this.emit('data', d);
  }

  function end() {
    const mac = ctr.condensedMac();

    if (!mac.equals(key.slice(24)) && !options.disableVerification) {
      return this.emit('error', Error('MAC verification failed'));
    }

    this.emit('end');
  }

  stream = pipeline(chunkSizeSafe(16), stream);
  return stream;
}

function unmergeKeyMac(key) {
  const newKey = Buffer.alloc(32);
  key.copy(newKey);

  for (let i = 0; i < 16; i++) {
    newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i, true), i);
  }

  return newKey;
}

function mergeKeyMac(key, mac) {
  const newKey = Buffer.alloc(32);
  key.copy(newKey);
  mac.copy(newKey, 24);

  for (let i = 0; i < 16; i++) {
    newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i), i);
  }

  return newKey;
}

function constantTimeCompare(bufferA, bufferB) {
  if (bufferA.length !== bufferB.length) return false;
  const len = bufferA.length;
  let result = 0;

  for (let i = 0; i < len; i++) {
    result |= bufferA[i] ^ bufferB[i];
  }

  return result === 0;
}

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
const globalState = {}; // --- Arbitrary Precision Math ---
// badd(a,b), bsub(a,b), bsqr(a), bmul(a,b)
// bdiv(a,b), bmod(a,b), bexpmod(g,e,m), bmodexp(g,e,m)
// bs is the shift, bm is the mask
// set single precision bits to 28

const bs = 28;
const bx2 = 1 << bs;
const bm = bx2 - 1;
const bd = bs >> 1;
const bdm = (1 << bd) - 1;
const log2 = Math.log(2);

function zeros(n) {
  const r = [];

  while (n-- > 0) r[n] = 0;

  return r;
}

function zclip(r) {
  let n = r.length;
  if (r[n - 1]) return r;

  while (n > 1 && r[n - 1] === 0) n--;

  return r.slice(0, n);
} // returns bit length of integer x


function nbits(x) {
  let n = 1;
  let t;

  if ((t = x >>> 16) !== 0) {
    x = t;
    n += 16;
  }

  if ((t = x >> 8) !== 0) {
    x = t;
    n += 8;
  }

  if ((t = x >> 4) !== 0) {
    x = t;
    n += 4;
  }

  if ((t = x >> 2) !== 0) {
    x = t;
    n += 2;
  }

  if ((t = x >> 1) !== 0) {
    x = t;
    n += 1;
  }

  return n;
}

function badd(a, b) {
  const al = a.length;
  const bl = b.length;
  if (al < bl) return badd(b, a);
  const r = [];
  let c = 0;
  let n = 0;

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
  const al = a.length;
  const bl = b.length;
  if (bl > al) return [];

  if (bl === al) {
    if (b[bl - 1] > a[bl - 1]) return [];
    if (bl === 1) return [a[0] - b[0]];
  }

  const r = [];
  let c = 0;
  let n;

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
  let xl = x & bdm;
  let xh = x >> bd;
  let yl = y & bdm;
  let yh = y >> bd;
  let m = xh * yl + yh * xl;
  let l = xl * yl + ((m & bdm) << bd) + w[n] + c;
  w[n] = l & bm;
  c = xh * yh + (m >> bd) + (l >> bs);
  return c;
} // Multiple-precision squaring, HAC Algorithm 14.16


function bsqr(x) {
  let t = x.length;
  let n = 2 * t;
  let r = zeros(n);
  let c = 0;
  let i, j;

  for (i = 0; i < t; i++) {
    c = ip(r, 2 * i, x[i], x[i], 0);

    for (j = i + 1; j < t; j++) {
      c = ip(r, i + j, 2 * x[j], x[i], c);
    }

    r[i + t] = c;
  }

  return zclip(r);
} // Multiple-precision multiplication, HAC Algorithm 14.12


function bmul(x, y) {
  let n = x.length;
  let t = y.length;
  let r = zeros(n + t - 1);
  let c, i, j;

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
  let n = 0;

  while (start >= 0 && len-- > 0) n = n * bx2 + x[start--];

  return n;
} // Multiple-precision division, HAC Algorithm 14.20


function bdiv(a, b) {
  let n = a.length - 1;
  let t = b.length - 1;
  let nmt = n - t;
  let x, y, qq, xx;
  let i; // trivial cases; a < b

  if (n < t || n === t && (a[n] < b[n] || n > 0 && a[n] === b[n] && a[n - 1] < b[n - 1])) {
    globalState.q = [0];
    globalState.mod = a;
    return globalState;
  } // trivial cases; q < 4


  if (n === t && toppart(a, t, 2) / toppart(b, t, 2) < 4) {
    x = a.concat();
    qq = 0;

    for (;;) {
      xx = bsub(x, b);
      if (xx.length === 0) break;
      x = xx;
      qq++;
    }

    globalState.q = [qq];
    globalState.mod = x;
    return globalState;
  } // normalize


  let shift2 = Math.floor(Math.log(b[t]) / log2) + 1;
  let shift = bs - shift2;
  x = a.concat();
  y = b.concat();

  if (shift) {
    for (i = t; i > 0; i--) y[i] = y[i] << shift & bm | y[i - 1] >> shift2;

    y[0] = y[0] << shift & bm;

    if (x[n] & (bm << shift2 & bm)) {
      x[++n] = 0;
      nmt++;
    }

    for (i = n; i > 0; i--) x[i] = x[i] << shift & bm | x[i - 1] >> shift2;

    x[0] = x[0] << shift & bm;
  }

  let x2;
  let q = zeros(nmt + 1);
  let y2 = zeros(nmt).concat(y);

  for (;;) {
    x2 = bsub(x, y2);
    if (x2.length === 0) break;
    q[nmt]++;
    x = x2;
  }

  let yt = y[t];
  let top = toppart(y, t, 2);
  let m;

  for (i = n; i > t; i--) {
    m = i - t - 1;

    if (i >= x.length) {
      q[m] = 1;
    } else if (x[i] === yt) {
      q[m] = bm;
    } else {
      q[m] = Math.floor(toppart(x, i, 2) / yt);
    }

    let topx = toppart(x, i, 3);

    while (q[m] * top > topx) q[m]--; // x-=q[m]*y*b^m


    y2 = y2.slice(1);
    x2 = bsub(x, bmul([q[m]], y2));

    if (x2.length === 0) {
      q[m]--;
      x2 = bsub(x, bmul([q[m]], y2));
    }

    x = x2;
  } // de-normalize


  if (shift) {
    for (i = 0; i < x.length - 1; i++) x[i] = x[i] >> shift | x[i + 1] << shift2 & bm;

    x[x.length - 1] >>= shift;
  }

  globalState.q = zclip(q);
  globalState.mod = zclip(x);
  return globalState;
} // returns the mod where m < 2^bd


function simplemod(i, m) {
  let c = 0;
  let v;

  for (let n = i.length - 1; n >= 0; n--) {
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

  let r = bdiv(p, m);
  return r.mod;
} // Barrett's modular reduction, HAC Algorithm 14.42


function bmod2(x, m, mu) {
  let xl = x.length - (m.length << 1);
  if (xl > 0) return bmod2(x.slice(0, xl).concat(bmod2(x.slice(xl), m, mu)), m, mu);
  let ml1 = m.length + 1;
  let ml2 = m.length - 1;
  let rr;
  let q3 = bmul(x.slice(ml2), mu).slice(ml1);
  let r1 = x.slice(0, ml1);
  let r2 = bmul(q3, m).slice(0, ml1);
  let r = bsub(r1, r2);

  if (r.length === 0) {
    r1[ml1] = 1;
    r = bsub(r1, r2);
  }

  for (let n = 0;; n++) {
    rr = bsub(r, m);
    if (rr.length === 0) break;
    r = rr;
    if (n >= 3) return bmod2(r, m, mu);
  }

  return r;
} // Modular exponentiation using Barrett reduction


function bmodexp(g, e, m) {
  let a = g.concat();
  let l = e.length - 1;
  let n = m.length * 2;
  let mu = zeros(n + 1);
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
} // Compute m**d mod p*q for RSA private key operations.


function RSAdecrypt(m, d, p, q, u) {
  let xp = bmodexp(bmod(m, p), bmod(d, bsub(p, [1])), p);
  let xq = bmodexp(bmod(m, q), bmod(d, bsub(q, [1])), q);
  let t = bsub(xq, xp);

  if (t.length === 0) {
    t = bsub(xp, xq);
    t = bmod(bmul(t, u), q);
    t = bsub(q, t);
  } else {
    t = bmod(bmul(t, u), q);
  }

  return badd(bmul(t, p), xp);
} // -----------------------------------------------------------------
// conversion functions: num array <-> multi precision integer (mpi)
// mpi: 2 octets with length in bits + octets in big endian order


function mpi2b(s) {
  let bn = 1;
  let r = [0];
  let rn = 0;
  let sb = 256;
  let sn = s.length;
  let c;
  if (sn < 2) return 0;
  let len = (sn - 2) * 8;
  let bits = s.charCodeAt(0) * 256 + s.charCodeAt(1);
  if (bits > len || bits < len - 8) return 0;

  for (let n = 0; n < len; n++) {
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
  let bn = 1;
  let bc = 0;
  let r = [0];
  let rb = 1;
  let rn = 0;
  let bits = b.length * bs;
  let rr = '';
  let n;

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

  while (rn >= 0 && r[rn] === 0) rn--;

  for (n = 0; n <= rn; n++) rr = String.fromCharCode(r[n]) + rr;

  return rr;
}
/**
 * cryptoDecodePrivKey
 * @public
 * @argv privk Buffer Private key
 * @return Private Key
 * @source https://github.com/meganz/webclient/blob/542d98ec61340b1e4fbf0dae0ae457c1bc5d49aa/js/crypto.js#L1448
 */


function cryptoDecodePrivKey(privk) {
  const pubkey = []; // decompose private key

  for (let i = 0; i < 4; i++) {
    const l = (privk[0] * 256 + privk[1] + 7 >> 3) + 2;
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
  const integerCiphertext = mpi2b(ciphertext.toString('binary'));
  const plaintext = b2s(RSAdecrypt(integerCiphertext, privkey[2], privkey[0], privkey[1], privkey[3]));
  return Buffer.from(plaintext, 'binary');
}

const MAX_RETRIES = 4;
const ERRORS = {
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
}; // The original MEGA package used https://g.api.mega.co.nz/

const DEFAULT_GATEWAY = 'https://eu.api.mega.co.nz/';

class API extends EventEmitter {
  constructor(keepalive) {
    super();
    this.keepalive = keepalive;
    this.counterId = Math.random().toString().substr(2, 10);
    this.gateway = DEFAULT_GATEWAY;
    this.requestModule = request;
  }

  request(json, cb, retryno = 0) {
    const qs = {
      id: (this.counterId++).toString()
    };

    if (this.sid) {
      qs.sid = this.sid;
    }

    if (typeof json._querystring === 'object') {
      Object.assign(qs, json._querystring);
      delete json._querystring;
    }

    this.requestModule({
      uri: `${this.gateway}cs`,
      qs,
      method: 'POST',
      json: [json],
      gzip: true
    }, (err, req, resp) => {
      if (err) return cb(err);
      if (!resp) return cb(Error('Empty response')); // Some error codes are returned as num, some as array with number.

      if (resp.length) resp = resp[0];

      if (!err && typeof resp === 'number' && resp < 0) {
        if (resp === -3) {
          if (retryno < MAX_RETRIES) {
            return setTimeout(() => {
              this.request(json, cb, retryno + 1);
            }, Math.pow(2, retryno + 1) * 1e3);
          }
        }

        err = Error(ERRORS[-resp]);
      } else {
        if (this.keepalive && resp && resp.sn) {
          this.pull(resp.sn);
        }
      }

      cb(err, resp);
    });
  }

  pull(sn, retryno = 0) {
    this.sn = this.requestModule({
      uri: `${this.gateway}sc`,
      qs: {
        sn,
        sid: this.sid
      },
      method: 'POST',
      json: true,
      body: `sc?${querystring.stringify({
        sn
      })}`
    }, (err, req, resp) => {
      this.sn = undefined;

      if (!err && typeof resp === 'number' && resp < 0) {
        if (resp === -3) {
          if (retryno < MAX_RETRIES) {
            return setTimeout(() => {
              this.pull(sn, retryno + 1);
            }, Math.pow(2, retryno + 1) * 1e3);
          }
        }

        err = Error(ERRORS[-resp]);
      }

      if (err) throw err;

      if (resp.w) {
        this.wait(resp.w, sn);
      } else if (resp.sn) {
        if (resp.a) {
          this.emit('sc', resp.a);
        }

        this.pull(resp.sn);
      }
    });
  }

  wait(url, sn) {
    this.sn = this.requestModule({
      uri: url,
      method: 'POST'
    }, (err, req, body) => {
      this.sn = undefined;
      if (err) throw Error('mega server wait req failed');
      this.pull(sn);
    });
  }

  close() {
    if (this.sn) this.sn.abort();
  }

}

let notLoggedApi;

class File extends EventEmitter {
  constructor(opt) {
    super();
    this.checkConstructorArgument(opt.downloadId);
    this.checkConstructorArgument(opt.key);
    this.checkConstructorArgument(opt.loadedFile);
    this.downloadId = opt.downloadId;
    this.key = opt.key ? formatKey(opt.key) : null;
    this.type = opt.directory ? 1 : 0;
    this.directory = !!opt.directory; // Create a new API object on demand

    if (!notLoggedApi) notLoggedApi = new API(false);
    this.api = notLoggedApi;
    this.loadedFile = opt.loadedFile;
  }

  get createdAt() {
    if (typeof this.timestamp !== 'undefined') {
      return this.timestamp * 1000;
    }
  }

  checkConstructorArgument(value) {
    // If a string was passed then check if it's not empty and
    // contains only base64 valid characters
    if (typeof value === 'string' && !/^[\w-]+$/.test(value)) {
      throw Error(`Invalid argument: "${value}"`);
    }
  }

  loadMetadata(aes, opt) {
    this.size = opt.s || 0;
    this.timestamp = opt.ts || 0;
    this.type = opt.t;
    this.directory = !!opt.t;
    this.owner = opt.u;
    this.name = null;
    if (!aes || !opt.k) return;
    const parts = opt.k.split(':');
    this.key = formatKey(parts[parts.length - 1]);
    aes.decryptECB(this.key);

    if (opt.a) {
      this.decryptAttributes(opt.a);
    }
  }

  decryptAttributes(at) {
    if (!this.key) return this;
    at = d64(at);
    getCipher(this.key).decryptCBC(at);
    const unpackedAttribtes = File.unpackAttributes(at);

    if (unpackedAttribtes) {
      this.parseAttributes(unpackedAttribtes);
    }

    return this;
  }

  parseAttributes(at) {
    this.attributes = at;
    this.name = at.n;
    this.label = LABEL_NAMES[at.lbl || 0];
    this.favorited = !!at.fav;
  }

  loadAttributes(cb) {
    if (typeof cb !== 'function') {
      cb = err => {
        if (err) throw err;
      };
    } // todo: nodeId version ('n')


    const req = this.directory ? {
      a: 'f',
      c: 1,
      ca: 1,
      r: 1,
      _querystring: {
        n: this.downloadId
      }
    } : {
      a: 'g',
      p: this.downloadId
    };
    this.api.request(req, (err, response) => {
      if (err) return cb(err);

      if (this.directory) {
        const filesMap = Object.create(null);
        const nodes = response.f;
        const folder = nodes.find(node => node.k && // the root folder is the one which "n" equals the first part of "k"
        node.h === node.k.split(':')[0]);
        const aes = this.key ? new AES(this.key) : null;
        this.nodeId = folder.h;
        this.timestamp = folder.ts;
        filesMap[folder.h] = this;

        var _iterator = _createForOfIteratorHelper(nodes),
            _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            let file = _step.value;
            if (file === folder) continue;
            const fileObj = new File(file, this.storage);
            fileObj.loadMetadata(aes, file); // is it the best way to handle this?

            fileObj.downloadId = [this.downloadId, file.h];
            filesMap[file.h] = fileObj;
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }

        var _iterator2 = _createForOfIteratorHelper(nodes),
            _step2;

        try {
          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
            let file = _step2.value;
            const parent = filesMap[file.p];

            if (parent) {
              const fileObj = filesMap[file.h];
              if (!parent.children) parent.children = [];
              parent.children.push(fileObj);
              fileObj.parent = parent;
            }
          }
        } catch (err) {
          _iterator2.e(err);
        } finally {
          _iterator2.f();
        }

        this.loadMetadata(aes, folder);

        if (this.key && !this.attributes) {
          return cb(Error('Attributes could not be decrypted with provided key.'));
        }

        if (this.loadedFile) {
          const loadedNode = filesMap[this.loadedFile];

          if (typeof loadedNode === 'undefined') {
            cb(Error('Node (file or folder) not found in folder'));
          } else {
            cb(null, loadedNode);
          }
        } else {
          cb(null, this);
        }
      } else {
        this.size = response.s;
        this.decryptAttributes(response.at);

        if (this.key && !this.attributes) {
          return cb(Error('Attributes could not be decrypted with provided key.'));
        }

        cb(null, this);
      }
    });
    return this;
  }

  download(options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (!options) options = {};
    const start = options.start || 0;
    const apiStart = options.returnCiphertext ? start : start - start % 16;
    let end = options.end || null;
    const maxConnections = options.maxConnections || 4;
    const initialChunkSize = options.initialChunkSize || 128 * 1024;
    const chunkSizeIncrement = options.chunkSizeIncrement || 128 * 1024;
    const maxChunkSize = options.maxChunkSize || 1024 * 1024;
    const ssl = options.forceHttps ? 2 : 0;
    const req = {
      a: 'g',
      g: 1,
      ssl
    };

    if (this.nodeId) {
      req.n = this.nodeId;
    } else if (Array.isArray(this.downloadId)) {
      req._querystring = {
        n: this.downloadId[0]
      };
      req.n = this.downloadId[1];
    } else {
      req.p = this.downloadId;
    }

    if (this.directory) throw Error("Can't download: folder download isn't supported"); // If options.returnCiphertext is true then the ciphertext is returned.
    // The result can be decrypted later using mega.decrypt() stream

    if (!this.key && !options.returnCiphertext) throw Error("Can't download: key isn't defined");
    const decryptStream = this.key && !options.returnCiphertext ? megaDecrypt(this.key, {
      start: apiStart,
      disableVerification: apiStart !== 0 || end !== null
    }) : new PassThrough();
    const stream = apiStart === start ? decryptStream : decryptStream.pipe(new StreamSkip({
      skip: start - apiStart
    }));
    const cs = this.api || notLoggedApi;
    const requestModule = options.requestModule || this.api.requestModule;
    cs.request(req, (err, response) => {
      if (err) return stream.emit('error', err);

      if (typeof response.g !== 'string' || response.g.substr(0, 4) !== 'http') {
        return stream.emit('error', Error('MEGA servers returned an invalid response, maybe caused by rate limit'));
      }

      if (!end) end = response.s - 1;
      if (start > end) return stream.emit('error', Error("You can't download past the end of the file."));

      function handleMegaErrors(resp) {
        if (resp.statusCode === 200) return;

        if (resp.statusCode === 509) {
          const timeLimit = resp.headers['x-mega-time-left'];
          const error = Error('Bandwidth limit reached: ' + timeLimit + ' seconds until it resets'); // Export error as a property of the error

          error.timeLimit = timeLimit;
          stream.emit('error', error);
          return;
        }

        stream.emit('error', Error('MEGA returned a ' + resp.statusCode + ' status code'));
      }

      function handleConnectionErrors(err) {
        stream.emit('error', Error('Connection error: ' + err.message));
      }

      if (maxConnections === 1) {
        const r = requestModule(response.g + '/' + apiStart + '-' + end);
        r.on('error', handleConnectionErrors);
        r.on('response', handleMegaErrors);
        r.pipe(decryptStream); // Abort stream if required

        stream.on('close', () => {
          r.abort();
        });
      } else {
        const combined = CombinedStream.create();
        let currentOffset = apiStart;
        let chunkSize = initialChunkSize;
        let stopped = false; // Stop the stream on errors and if required

        stream.on('error', () => {
          stopped = true;
        });
        stream.on('close', () => {
          stopped = true;
        });

        const getChunk = function getChunk() {
          if (stopped) return;
          const currentMax = Math.min(end, currentOffset + chunkSize - 1);
          if (currentMax < currentOffset) return;
          const r = requestModule(response.g + '/' + currentOffset + '-' + currentMax);
          r.on('end', getChunk);
          r.on('error', handleConnectionErrors);
          r.on('response', handleMegaErrors);
          combined.append(r);
          currentOffset = currentMax + 1;

          if (chunkSize < maxChunkSize) {
            chunkSize = chunkSize + chunkSizeIncrement;
          }
        }; // Pass errors from the combined stream to the main stream


        combined.on('error', err => stream.emit('error', err));

        for (let i = 0; i < maxConnections; i++) {
          getChunk();
        }

        combined.pipe(decryptStream);
      }

      let i = 0;
      stream.on('data', d => {
        i += d.length;
        stream.emit('progress', {
          bytesLoaded: i,
          bytesTotal: response.s
        });
      });
    });
    if (cb) streamToCb(stream, cb);
    return stream;
  }

  link(options, cb) {
    if (arguments.length === 1 && typeof options === 'function') {
      cb = options;
      options = {
        noKey: false
      };
    }

    if (typeof options === 'boolean') {
      options = {
        noKey: options
      };
    }

    let url = `https://mega.nz/${this.directory ? 'folder' : 'file'}/${this.downloadId}`;
    if (!options.noKey && this.key) url += `#${e64(this.key)}`;

    if (!options.noKey && this.loadedFile) {
      // TODO: check if the loaded file is, in fact, a folder
      url += `/file/${this.loadedFile}`;
    }

    cb(null, url);
  }

  static fromURL(opt) {
    if (typeof opt === 'object') {
      // todo: warn to use File directly
      return new File(opt);
    } // Supported formats:
    // Old format:
    // https://mega.nz/#!file_handler
    // https://mega.nz/#!file_handler!file_key
    // https://mega.nz/#F!folder_handler
    // https://mega.nz/#F!folder_handler!folder_key
    // https://mega.nz/#F!folder_handler!folder_key!file_handler
    // New format (2020):
    // https://mega.nz/file/file_handler
    // https://mega.nz/file/file_handler#file_key
    // https://mega.nz/folder/folder_handler
    // https://mega.nz/folder/folder_handler#folder_key
    // https://mega.nz/folder/folder_handler#folder_key/file/file_handler


    const url = parse(opt);

    if (url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') {
      throw Error('Invalid URL: wrong hostname');
    }

    if (!url.hash) throw Error('Invalid URL: no hash');

    if (url.path.match(/\/(file|folder)\//) !== null) {
      // new format
      const split = url.hash.substr(1).split('/file/');
      const fileHandler = url.path.substring(url.path.lastIndexOf('/') + 1, url.path.length + 1);
      const fileKey = split[0];
      if (fileHandler && !fileKey || !fileHandler && fileKey) throw Error('Invalid URL: too few arguments');
      return new File({
        downloadId: fileHandler,
        key: fileKey,
        directory: url.path.indexOf('/folder/') >= 0,
        loadedFile: split[1]
      });
    } else {
      // old format
      const split = url.hash.split('!');

      if (split[0] !== '#' && split[0] !== '#F') {
        throw Error('Invalid URL: format not recognized');
      }

      if (split.length <= 1) throw Error('Invalid URL: too few arguments');

      if (split.length >= (split[0] === '#' ? 4 : 5)) {
        throw Error('Invalid URL: too many arguments');
      }

      return new File({
        downloadId: split[1],
        key: split[2],
        directory: split[0] === '#F',
        loadedFile: split[3]
      });
    }
  }

  static unpackAttributes(at) {
    // read until the first null byte
    let end = 0;

    while (end < at.length && at.readUInt8(end)) end++;

    at = at.slice(0, end).toString();
    if (at.substr(0, 6) !== 'MEGA{"') return;

    try {
      return JSON.parse(at.substr(4));
    } catch (e) {}
  }

}

const LABEL_NAMES = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'];

const KEY_CACHE = {}; // metadata can be mutated, not the content

class MutableFile extends File {
  constructor(opt, storage) {
    super(opt);
    this.storage = storage;
    this.api = storage.api;
    this.nodeId = opt.h;
    this.timestamp = opt.ts;
    this.type = opt.t;
    this.directory = !!this.type;

    if (opt.k) {
      const idKeyPairs = opt.k.split('/');
      let aes = storage.aes;

      var _iterator = _createForOfIteratorHelper(idKeyPairs),
          _step;

      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          let idKeyPair = _step.value;
          const id = idKeyPair.split(':')[0];

          if (id === storage.user) {
            opt.k = idKeyPair;
            break;
          }

          const shareKey = storage.shareKeys[id];

          if (shareKey) {
            opt.k = idKeyPair;
            aes = KEY_CACHE[id];

            if (!aes) {
              aes = KEY_CACHE[id] = new AES(shareKey);
            }

            break;
          }
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }

      this.loadMetadata(aes, opt);
    }
  }

  loadAttributes() {
    throw Error('This is not needed for files loaded from logged in sessions');
  }

  mkdir(opt, cb) {
    if (!this.directory) throw Error("node isn't a directory");

    if (typeof opt === 'string') {
      opt = {
        name: opt
      };
    }

    if (!opt.attributes) opt.attributes = {};
    if (opt.name) opt.attributes.n = opt.name;

    if (!opt.attributes.n) {
      throw Error('file name is required');
    }

    if (!opt.target) opt.target = this;
    if (!opt.key) opt.key = Buffer.from(secureRandom(16));

    if (opt.key.length !== 16) {
      throw Error('wrong key length, must be 128bit');
    }

    const key = opt.key;
    const at = MutableFile.packAttributes(opt.attributes);
    getCipher(key).encryptCBC(at);
    const storedKey = Buffer.from(key);
    this.storage.aes.encryptECB(storedKey);
    const request$$1 = {
      a: 'p',
      t: opt.target.nodeId ? opt.target.nodeId : opt.target,
      n: [{
        h: 'xxxxxxxx',
        t: 1,
        a: e64(at),
        k: e64(storedKey)
      }]
    };
    const shares = getShares(this.storage.shareKeys, this);

    if (shares.length > 0) {
      request$$1.cr = makeCryptoRequest(this.storage, [{
        nodeId: 'xxxxxxxx',
        key
      }], shares);
    }

    this.api.request(request$$1, (err, response) => {
      if (err) return returnError(err);

      const file = this.storage._importFile(response.f[0]);

      this.storage.emit('add', file);

      if (cb) {
        cb(null, file);
      }
    });

    function returnError(e) {
      if (cb) cb(e);
    }
  }

  upload(opt, source, cb) {
    if (!this.directory) throw Error('node is not a directory');

    if (arguments.length === 2 && typeof source === 'function') {
      var _ref = [source, null];
      cb = _ref[0];
      source = _ref[1];
    }

    if (typeof opt === 'string') {
      opt = {
        name: opt
      };
    }

    if (!opt.attributes) opt.attributes = {};
    if (opt.name) opt.attributes.n = opt.name;

    if (!opt.attributes.n) {
      throw Error('File name is required.');
    }

    if (!opt.target) opt.target = this;
    let finalKey;
    let key = formatKey(opt.key);
    if (!key) key = secureRandom(24);
    if (!(key instanceof Buffer)) key = Buffer.from(key); // Ciphertext uploading only works if is `uploadCiphertext` is set to true
    // This is in case some application allowed key to be modified
    // by the users without checking the size

    const keySize = opt.uploadCiphertext ? 32 : 24;

    if (key.length !== keySize) {
      throw Error('Wrong key length. Key must be 192bit');
    }

    if (opt.uploadCiphertext) {
      finalKey = key;
      key = unmergeKeyMac(key).slice(0, 24);
    }

    opt.key = key;
    const hashes = [];

    const checkCallbacks = (err, type, hash, encrypter) => {
      if (err) return returnError(err);

      if (!hash || hash.length === 0) {
        returnError(Error('Server returned a invalid response while uploading'));
        return;
      }

      const errorCheck = Number(hash.toString());

      if (errorCheck < 0) {
        returnError(Error('Server returned error ' + errorCheck + ' while uploading'));
        return;
      }

      hashes[type] = hash;
      if (type === 0 && !finalKey) finalKey = encrypter.key;
      if (opt.thumbnailImage && !hashes[1]) return;
      if (opt.previewImage && !hashes[2]) return;
      if (!hashes[0]) return;
      const at = MutableFile.packAttributes(opt.attributes);
      getCipher(finalKey).encryptCBC(at);
      const storedKey = Buffer.from(finalKey);
      this.storage.aes.encryptECB(storedKey);
      const fileObject = {
        h: e64(hashes[0]),
        t: 0,
        a: e64(at),
        k: e64(storedKey)
      };

      if (hashes.length !== 1) {
        fileObject.fa = hashes.slice(1).map((hash, index) => {
          return index + '*' + e64(hash);
        }).filter(e => e).join('/');
      }

      const request$$1 = {
        a: 'p',
        t: opt.target.nodeId ? opt.target.nodeId : opt.target,
        n: [fileObject]
      };
      const shares = getShares(this.storage.shareKeys, this);

      if (shares.length > 0) {
        request$$1.cr = makeCryptoRequest(this.storage, [{
          nodeId: fileObject.h,
          key: finalKey
        }], shares);
      }

      this.api.request(request$$1, (err, response) => {
        if (err) return returnError(err);

        const file = this.storage._importFile(response.f[0]);

        this.storage.emit('add', file);
        stream.emit('complete', file);
        if (cb) cb(null, file);
      });
    };

    if (opt.thumbnailImage) {
      this._uploadAttribute(opt, opt.thumbnailImage, 1, checkCallbacks);
    }

    if (opt.previewImage) {
      this._uploadAttribute(opt, opt.previewImage, 2, checkCallbacks);
    }

    const stream = this._upload(opt, source, 0, checkCallbacks);

    const returnError = e => {
      if (cb) {
        cb(e);
      } else {
        stream.emit('error', e);
      }
    };

    return stream;
  }

  _upload(opt, source, type, cb) {
    const encrypter = opt.uploadCiphertext ? through() : megaEncrypt(opt.key);
    const pause = through().pause();
    let stream = pipeline(pause, encrypter); // Size is needed before upload. Kills the streaming otherwise.

    let size = opt.size; // handle buffer

    if (source && typeof source.pipe !== 'function') {
      size = source.length;
      stream.end(source);
    }

    if (size) {
      this._uploadWithSize(stream, size, encrypter, pause, type, opt, cb);
    } else {
      stream = pipeline(detectSize(size => {
        this._uploadWithSize(stream, size, encrypter, pause, type, opt, cb);
      }), stream);
    } // handle stream


    if (source && typeof source.pipe === 'function') {
      source.pipe(stream);
    }

    return stream;
  }

  _uploadAttribute(opt, source, type, cb) {
    const gotBuffer = (err, buffer) => {
      if (err) return cb(err);
      const len = buffer.length;
      const rest = Math.ceil(len / 16) * 16 - len;

      if (rest !== 0) {
        buffer = Buffer.concat([buffer, Buffer.alloc(rest)]);
      }

      const encrypter = opt.handle ? getCipher(opt.key) : new AES(opt.key.slice(0, 16));
      encrypter.encryptCBC(buffer);
      const pause = through().pause();
      let stream = pipeline(pause);
      stream.end(buffer);

      this._uploadWithSize(stream, buffer.length, stream, pause, type, opt, cb);
    }; // handle buffer


    if (source instanceof Buffer) {
      gotBuffer(null, source);
      return;
    }

    streamToCb(source, gotBuffer);
  }

  _uploadWithSize(stream, size, source, pause, type, opt, cb) {
    const ssl = opt.forceHttps ? 2 : 0;
    const getUrlRequest = type === 0 ? {
      a: 'u',
      ssl,
      s: size,
      ms: 0,
      r: 0,
      e: 0,
      v: 2
    } : {
      a: 'ufa',
      ssl,
      s: size
    };

    if (opt.handle) {
      getUrlRequest.h = opt.handle;
    }

    const initialChunkSize = type === 0 ? opt.initialChunkSize || 128 * 1024 : size;
    const chunkSizeIncrement = opt.chunkSizeIncrement || 128 * 1024;
    const maxChunkSize = opt.maxChunkSize || 1024 * 1024;
    const maxConnections = opt.maxConnections || 4;
    let currentChunkSize = initialChunkSize;
    let activeConnections = 0;
    let isReading = false;
    let position = 0;
    let remainingBuffer;
    let uploadBuffer, uploadURL;
    let chunkSize, chunkPos;

    const handleChunk = () => {
      chunkSize = Math.min(currentChunkSize, size - position);
      uploadBuffer = Buffer.alloc(chunkSize);
      activeConnections++;

      if (currentChunkSize < maxChunkSize) {
        currentChunkSize += chunkSizeIncrement;
      }

      chunkPos = 0;

      if (remainingBuffer) {
        remainingBuffer.copy(uploadBuffer);
        chunkPos = Math.min(remainingBuffer.length, chunkSize);
        remainingBuffer = remainingBuffer.length > chunkSize ? remainingBuffer.slice(chunkSize) : null;
      } // It happens when the remaining buffer contains the entire chunk


      if (chunkPos === chunkSize) {
        sendChunk();
      } else {
        isReading = true;
        pause.resume();
      }
    };

    const sendChunk = () => {
      const httpreq = this.api.requestModule({
        method: 'POST',
        body: uploadBuffer,
        uri: uploadURL + '/' + (type === 0 ? position : type - 1),
        forever: true
      });
      httpreq.on('error', error => {
        stream.emit('error', Error('Connection error: ' + error.message));
      });
      httpreq.on('response', response => {
        if (response.statusCode === 200) return;
        stream.emit('error', Error('MEGA returned a ' + response.statusCode + ' status code'));
      });
      uploadBuffer = null;
      position += chunkSize;
      streamToCb(httpreq, (err, hash) => {
        if (err || !hash || hash.length > 0) {
          source.end();
          cb(err, type, hash, source);
        } else if (position < size && !isReading) {
          handleChunk();
        }
      });

      if (position < size && !isReading && activeConnections < maxConnections) {
        handleChunk();
      }
    };

    let sizeCheck = 0;
    source.on('data', data => {
      sizeCheck += data.length;
      stream.emit('progress', {
        bytesLoaded: sizeCheck,
        bytesTotal: size
      });
      data.copy(uploadBuffer, chunkPos);
      chunkPos += data.length;

      if (chunkPos >= chunkSize) {
        isReading = false;
        pause.pause();
        remainingBuffer = data.slice(data.length - (chunkPos - chunkSize));
        sendChunk();
      }
    });
    source.on('end', () => {
      if (size && sizeCheck !== size) {
        stream.emit('error', Error('Specified data size does not match: ' + size + ' !== ' + sizeCheck));
      }
    });
    this.api.request(getUrlRequest, (err, resp) => {
      if (err) return cb(err);
      uploadURL = resp.p;
      handleChunk();
    });
  }

  uploadAttribute(type, data, callback) {
    if (typeof type === 'string') {
      type = ['thumbnail', 'preview'].indexOf(type);
    }

    if (type !== 0 && type !== 1) throw Error('Invalid attribute type');

    this._uploadAttribute({
      key: this.key,
      handle: this.nodeId
    }, data, type + 1, (err, streamType, hash, encrypter) => {
      if (err) return callback(err);
      const request$$1 = {
        a: 'pfa',
        n: this.nodeId,
        fa: type + '*' + e64(hash)
      };
      this.api.request(request$$1, (err, response) => {
        if (err) return callback(err);
        callback(null, this);
      });
    });
  }

  delete(permanent, cb) {
    if (typeof permanent === 'function') {
      cb = permanent;
      permanent = undefined;
    }

    if (typeof permanent === 'undefined') {
      permanent = this.parent === this.storage.trash;
    }

    if (permanent) {
      this.api.request({
        a: 'd',
        n: this.nodeId
      }, cb);
    } else {
      this.moveTo(this.storage.trash, cb);
    }

    return this;
  }

  moveTo(target, cb) {
    if (typeof target === 'string') {
      target = this.storage.files[target];
    }

    if (!(target instanceof File)) {
      throw Error('target must be a folder or a nodeId');
    }

    const request$$1 = {
      a: 'm',
      n: this.nodeId,
      t: target.nodeId
    };
    const shares = getShares(this.storage.shareKeys, target);

    if (shares.length > 0) {
      request$$1.cr = makeCryptoRequest(this.storage, [this], shares);
    }

    this.api.request(request$$1, cb);
    return this;
  }

  setAttributes(attributes, cb) {
    Object.assign(this.attributes, attributes);
    const newAttributes = MutableFile.packAttributes(this.attributes);
    getCipher(this.key).encryptCBC(newAttributes);
    this.api.request({
      a: 'a',
      n: this.nodeId,
      at: e64(newAttributes)
    }, () => {
      this.parseAttributes(this.attributes);
      if (cb) cb();
    });
    return this;
  }

  rename(filename, cb) {
    this.setAttributes({
      n: filename
    }, cb);
    return this;
  }

  setLabel(label, cb) {
    if (typeof label === 'string') label = LABEL_NAMES.indexOf(label);

    if (typeof label !== 'number' || Math.floor(label) !== label || label < 0 || label > 7) {
      throw Error('label must be a integer between 0 and 7 or a valid label name');
    }

    this.setAttributes({
      lbl: label
    }, cb);
    return this;
  }

  setFavorite(isFavorite, cb) {
    this.setAttributes({
      fav: isFavorite ? 1 : 0
    }, cb);
    return this;
  }

  link(options, cb) {
    if (arguments.length === 1 && typeof options === 'function') {
      cb = options;
      options = {
        noKey: false
      };
    }

    if (typeof options === 'boolean') {
      options = {
        noKey: options
      };
    } // __folderKey is used internally, don't use this


    const folderKey = options.__folderKey;

    if (this.directory && !folderKey) {
      this.shareFolder(options, cb);
      return this;
    }

    this.api.request({
      a: 'l',
      n: this.nodeId
    }, (err, id) => {
      if (err) return cb(err);
      let url = `https://mega.nz/${folderKey ? 'folder' : 'file'}/${id}`;
      if (!options.noKey && this.key) url += `#${e64(folderKey || this.key)}`;
      cb(null, url);
    });
    return this;
  }

  shareFolder(options, cb) {
    if (!this.directory) throw Error("node isn't a folder");
    const handler = this.nodeId;
    const storedShareKey = this.storage.shareKeys[handler];

    if (storedShareKey) {
      this.link(Object.assign({
        __folderKey: storedShareKey
      }, options), cb);
      return this;
    }

    let shareKey = formatKey(options.key);

    if (!shareKey) {
      shareKey = secureRandom(16);
    }

    if (!(shareKey instanceof Buffer)) {
      shareKey = Buffer.from(shareKey);
    }

    if (shareKey.length !== 16) {
      process.nextTick(() => {
        cb(Error('share key must be 16 byte / 22 characters'));
      });
      return;
    }

    this.storage.shareKeys[handler] = shareKey;
    const authKey = Buffer.from(handler + handler);
    this.storage.aes.encryptECB(authKey);
    const request$$1 = {
      a: 's2',
      n: handler,
      s: [{
        u: 'EXP',
        r: 0
      }],
      ok: e64(this.storage.aes.encryptECB(Buffer.from(shareKey))),
      ha: e64(authKey),
      cr: makeCryptoRequest(this.storage, this)
    };
    this.api.request(request$$1, err => {
      if (err) return cb(err);
      this.link(Object.assign({
        __folderKey: shareKey
      }, options), cb);
    });
    return this;
  }

  unshareFolder(options, cb) {
    const request$$1 = {
      a: 's2',
      n: this.nodeId,
      s: [{
        u: 'EXP',
        r: ''
      }]
    };
    delete this.storage.shareKeys[this.nodeId];
    this.api.request(request$$1, () => {
      if (cb) cb();
    });
    return this;
  }

  importFile(sharedFile, cb) {
    if (!this.directory) throw Error('importFile can only be called on directories');
    if (typeof sharedFile === 'string') sharedFile = File.fromURL(sharedFile);
    if (!(sharedFile instanceof File)) throw Error('First argument of importFile should be a File or a URL string');
    if (!sharedFile.key) return cb(Error("Can't import files without encryption keys")); // We need file attributes

    const afterGotAttributes = (err, file) => {
      if (err) return cb(err);
      const attributes = MutableFile.packAttributes(file.attributes);
      getCipher(file.key).encryptCBC(attributes);
      const downloadId = Array.isArray(file.downloadId) ? file.downloadId[1] : file.downloadId;
      const request$$1 = {
        a: 'p',
        t: this.nodeId,
        n: [{
          ph: downloadId,
          t: 0,
          a: e64(attributes),
          k: e64(this.storage.aes.encryptECB(file.key))
        }]
      };
      this.api.request(request$$1, (err, response) => {
        if (err) return cb(err);

        const file = this.storage._importFile(response.f[0]);

        this.storage.emit('add', file);
        if (cb) cb(null, file);
      });
    }; // Check if attributes were already downloaded


    if (sharedFile.attributes) {
      process.nextTick(afterGotAttributes, null, sharedFile);
    } else {
      sharedFile.loadAttributes(afterGotAttributes);
    }

    return this;
  }

  static packAttributes(attributes) {
    let at = JSON.stringify(attributes);
    at = Buffer.from(`MEGA${at}`);
    const ret = Buffer.alloc(Math.ceil(at.length / 16) * 16);
    at.copy(ret);
    return ret;
  }

} // source: https://github.com/meganz/webclient/blob/918222d5e4521c8777b1c8da528f79e0110c1798/js/crypto.js#L3728
// generate crypto request response for the given nodes/shares matrix


function makeCryptoRequest(storage, sources, shares) {
  const shareKeys = storage.shareKeys;

  if (!Array.isArray(sources)) {
    sources = selfAndChildren(sources);
  }

  if (!shares) {
    shares = sources.map(source => getShares(shareKeys, source)).reduce((arr, el) => arr.concat(el)).filter((el, index, arr) => index === arr.indexOf(el));
  }

  const cryptoRequest = [shares, sources.map(node => node.nodeId), []]; // TODO: optimize - keep track of pre-existing/sent keys, only send new ones

  for (let i = shares.length; i--;) {
    const aes = new AES(shareKeys[shares[i]]);

    for (let j = sources.length; j--;) {
      const fileKey = Buffer.from(sources[j].key);

      if (fileKey && (fileKey.length === 32 || fileKey.length === 16)) {
        cryptoRequest[2].push(i, j, e64(aes.encryptECB(fileKey)));
      }
    }
  }

  return cryptoRequest;
}

function selfAndChildren(node) {
  return [node].concat((node.children || []).map(selfAndChildren).reduce((arr, el) => arr.concat(el), []));
}

function getShares(shareKeys, node) {
  const handle = node.nodeId;
  const parent = node.parent;
  const shares = [];

  if (shareKeys[handle]) {
    shares.push(handle);
  }

  return parent ? shares.concat(getShares(shareKeys, parent)) : shares;
}

class Storage extends EventEmitter {
  constructor(options, cb) {
    super();

    if (arguments.length === 1 && typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (!options.email) {
      throw Error("starting a session without credentials isn't supported");
    }

    if (!cb) {
      cb = err => {
        // Would be nicer to emit error event?
        if (err) throw err;
      };
    } // Defaults


    options.keepalive = options.keepalive === undefined ? true : !!options.keepalive;
    options.autoload = options.autoload === undefined ? true : !!options.autoload;
    options.autologin = options.autologin === undefined ? true : !!options.autologin;
    this.api = new API(options.keepalive);
    this.files = {};
    this.options = options;

    if (options.autologin) {
      this.login(cb);
    } else {
      // Do not release Zalgo!
      process.nextTick(() => cb(null, this));
    }

    this.status = 'closed';
  }

  login(cb) {
    const ready = () => {
      this.status = 'ready';
      cb(null, this);
      this.emit('ready', this);
    };

    const loadUser = cb => {
      this.api.request({
        a: 'ug'
      }, (err, response) => {
        if (err) return cb(err);
        this.name = response.name;
        this.user = response.u;

        if (this.options.autoload) {
          this.reload(true, err => {
            if (err) return cb(err);
            ready();
          });
        } else {
          ready();
        }
      });
    }; // MEGA lower cases email addresses (issue #40)


    this.email = this.options.email.toLowerCase();

    const handleV1Account = cb => {
      const pw = prepareKey(Buffer.from(this.options.password)); // after generating the AES key the password isn't needed anymore

      delete this.options.password;
      const aes = new AES(pw);
      const uh = e64(aes.stringhash(Buffer.from(this.email)));
      const request$$1 = {
        a: 'us',
        user: this.email,
        uh
      };
      finishLogin(request$$1, aes, cb);
    };

    const handleV2Account = (info, cb) => {
      prepareKeyV2(Buffer.from(this.options.password), info, (err, result) => {
        if (err) return cb(err); // after generating the AES key the password isn't needed anymore
        // delete this.options.password

        const aes = new AES(result.slice(0, 16));
        const uh = e64(result.slice(16));
        const request$$1 = {
          a: 'us',
          user: this.email,
          uh
        };
        finishLogin(request$$1, aes, cb);
      });
    };

    const finishLogin = (request$$1, aes, cb) => {
      this.api.request(request$$1, (err, response) => {
        if (err) return cb(err);
        this.key = formatKey(response.k);
        aes.decryptECB(this.key);
        this.aes = new AES(this.key);
        const t = formatKey(response.csid);
        const privk = this.aes.decryptECB(formatKey(response.privk));
        const rsaPrivk = cryptoDecodePrivKey(privk);
        if (!rsaPrivk) throw Error('invalid credentials');
        let sid = e64(cryptoRsaDecrypt(t, rsaPrivk).slice(0, 43));
        this.api.sid = this.sid = sid;
        this.RSAPrivateKey = rsaPrivk;
        loadUser(cb);
      });
    };

    this.api.request({
      a: 'us0',
      user: this.email
    }, (err, response) => {
      if (err) return cb(err);
      if (response.v === 1) return handleV1Account(cb);
      if (response.v === 2) return handleV2Account(response, cb);
      cb(Error('Account version not supported'));
    });
    this.status = 'connecting';
  }

  reload(force, cb) {
    if (typeof force === 'function') {
      var _ref = [cb, force];
      force = _ref[0];
      cb = _ref[1];
    }

    if (this.status === 'connecting' && !force) {
      return this.once('ready', this.reload.bind(this, force, cb));
    }

    this.mounts = [];
    this.api.request({
      a: 'f',
      c: 1
    }, (err, response) => {
      if (err) return cb(err);
      this.shareKeys = response.ok.reduce((shares, share) => {
        const handler = share.h; // MEGA handles share authenticity by checking the value below

        const auth = this.aes.encryptECB(Buffer.from(handler + handler)); // original implementation doesn't compare in constant time, but...

        if (constantTimeCompare(formatKey(share.ha), auth)) {
          shares[handler] = this.aes.decryptECB(formatKey(share.k));
        } // If verification fails the share was tampered... by MEGA servers.
        // Well, never trust the server, the code says...


        return shares;
      }, {});
      response.f.forEach(file => this._importFile(file));
      cb(null, this.mounts);
    });
    this.api.on('sc', arr => {
      const deleted = {};
      arr.forEach(o => {
        if (o.a === 'u') {
          const file = this.files[o.n];

          if (file) {
            file.timestamp = o.ts;
            file.decryptAttributes(o.at);
            file.emit('update');
            this.emit('update', file);
          }
        } else if (o.a === 'd') {
          deleted[o.n] = true; // Don't know yet if move or delete.
        } else if (o.a === 't') {
          o.t.f.forEach(f => {
            const file = this.files[f.h];

            if (file) {
              delete deleted[f.h];
              const oldparent = file.parent;
              if (oldparent.nodeId === f.p) return; // todo: move to setParent() to avoid duplicate.

              oldparent.children.splice(oldparent.children.indexOf(file), 1);
              file.parent = this.files[f.p];
              if (!file.parent.children) file.parent.children = [];
              file.parent.children.push(file);
              file.emit('move', oldparent);
              this.emit('move', file, oldparent);
            } else {
              this.emit('add', this._importFile(f));
            }
          });
        }
      });
      Object.keys(deleted).forEach(n => {
        const file = this.files[n];
        const parent = file.parent;
        parent.children.splice(parent.children.indexOf(file), 1);
        this.emit('delete', file);
        file.emit('delete');
      });
    });
  }

  _importFile(f) {
    // todo: no support for updates
    if (!this.files[f.h]) {
      const file = this.files[f.h] = new MutableFile(f, this);

      if (f.t === NODE_TYPE_DRIVE) {
        this.root = file;
        file.name = 'Cloud Drive';
      }

      if (f.t === NODE_TYPE_RUBBISH_BIN) {
        this.trash = file;
        file.name = 'Rubbish Bin';
      }

      if (f.t === NODE_TYPE_INBOX) {
        this.inbox = file;
        file.name = 'Inbox';
      }

      if (f.t > 1) {
        this.mounts.push(file);
      }

      if (f.p) {
        let parent = this.files[f.p]; // Issue 58: some accounts have orphan files

        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(file);
          file.parent = parent;
        }
      }
    }

    return this.files[f.h];
  } // alternative to this.root.mkdir


  mkdir(opt, cb) {
    // Wait for ready event.
    if (this.status !== 'ready') {
      this.on('ready', () => {
        return this.root.mkdir(opt, cb);
      });
      return;
    }

    return this.root.mkdir(opt, cb);
  } // alternative to this.root.upload


  upload(opt, buffer, cb) {
    // Wait for ready event.
    if (this.status !== 'ready') {
      this.on('ready', () => {
        return this.root.upload(opt, buffer, cb);
      });
      return;
    }

    return this.root.upload(opt, buffer, cb);
  }

  close() {
    // does not handle still connecting or incomplete streams
    this.status = 'closed';
    this.api.close();
  }

  getAccountInfo(cb) {
    this.api.request({
      a: 'uq',
      strg: 1,
      xfer: 1,
      pro: 1
    }, (err, response) => {
      if (err) cb(err);
      const account = {}; // Normalize responses from API

      account.type = response.utype;
      account.spaceUsed = response.cstrg;
      account.spaceTotal = response.mstrg;
      account.downloadBandwidthTotal = response.mxfer || Math.pow(1024, 5) * 10;
      account.downloadBandwidthUsed = response.caxfer || 0;
      account.sharedBandwidthUsed = response.csxfer || 0;
      account.sharedBandwidthLimit = response.srvratio;
      cb(null, account);
    });
  }

  toJSON() {
    return {
      key: e64(this.key),
      sid: this.sid,
      name: this.name,
      user: this.user,
      options: this.options
    };
  }

  static fromJSON(json) {
    const storage = new Storage(Object.assign(json.options, {
      autoload: false,
      autologin: false
    }));
    storage.key = d64(json.key);
    storage.aes = new AES(storage.key);
    storage.api.sid = storage.sid = json.sid;
    storage.name = json.name;
    storage.user = json.user;
    return storage;
  }

}

const NODE_TYPE_DRIVE = 2;
const NODE_TYPE_INBOX = 3;
const NODE_TYPE_RUBBISH_BIN = 4;

const fileFromURL = File.fromURL;

export { Storage, File, fileFromURL as file, megaEncrypt as encrypt, megaDecrypt as decrypt };
