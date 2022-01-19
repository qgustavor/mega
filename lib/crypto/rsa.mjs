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
const globalState = {}

// --- Arbitrary Precision Math ---
// badd(a,b), bsub(a,b), bsqr(a), bmul(a,b)
// bdiv(a,b), bmod(a,b), bexpmod(g,e,m), bmodexp(g,e,m)

// bs is the shift, bm is the mask
// set single precision bits to 28
const bs = 28
const bx2 = 1 << bs
const bm = bx2 - 1
const bd = bs >> 1
const bdm = (1 << bd) - 1

const log2 = Math.log(2)

function zeros (n) {
  const r = []

  while (n-- > 0) r[n] = 0
  return r
}

function zclip (r) {
  let n = r.length
  if (r[n - 1]) return r
  while (n > 1 && r[n - 1] === 0) n--
  return r.slice(0, n)
}

// returns bit length of integer x
function nbits (x) {
  let n = 1
  let t
  if ((t = x >>> 16) !== 0) { x = t; n += 16 }
  if ((t = x >> 8) !== 0) { x = t; n += 8 }
  if ((t = x >> 4) !== 0) { x = t; n += 4 }
  if ((t = x >> 2) !== 0) { x = t; n += 2 }
  if ((t = x >> 1) !== 0) { x = t; n += 1 }
  return n
}

function badd (a, b) {
  const al = a.length
  const bl = b.length

  if (al < bl) return badd(b, a)

  const r = []
  let c = 0
  let n = 0

  for (; n < bl; n++) {
    c += a[n] + b[n]
    r[n] = c & bm
    c >>>= bs
  }
  for (; n < al; n++) {
    c += a[n]
    r[n] = c & bm
    c >>>= bs
  }
  if (c) r[n] = c
  return r
}

function bsub (a, b) {
  const al = a.length
  const bl = b.length

  if (bl > al) return []
  if (bl === al) {
    if (b[bl - 1] > a[bl - 1]) return []
    if (bl === 1) return [a[0] - b[0]]
  }

  const r = []
  let c = 0
  let n

  for (n = 0; n < bl; n++) {
    c += a[n] - b[n]
    r[n] = c & bm
    c >>= bs
  }
  for (;n < al; n++) {
    c += a[n]
    r[n] = c & bm
    c >>= bs
  }
  if (c) return []

  return zclip(r)
}

function ip (w, n, x, y, c) {
  const xl = x & bdm
  const xh = x >> bd

  const yl = y & bdm
  const yh = y >> bd

  const m = xh * yl + yh * xl
  const l = xl * yl + ((m & bdm) << bd) + w[n] + c
  w[n] = l & bm
  c = xh * yh + (m >> bd) + (l >> bs)
  return c
}

// Multiple-precision squaring, HAC Algorithm 14.16

function bsqr (x) {
  const t = x.length
  const n = 2 * t
  const r = zeros(n)
  let c = 0
  let i, j

  for (i = 0; i < t; i++) {
    c = ip(r, 2 * i, x[i], x[i], 0)
    for (j = i + 1; j < t; j++) {
      c = ip(r, i + j, 2 * x[j], x[i], c)
    }
    r[i + t] = c
  }

  return zclip(r)
}

// Multiple-precision multiplication, HAC Algorithm 14.12

function bmul (x, y) {
  const n = x.length
  const t = y.length
  const r = zeros(n + t - 1)
  let c, i, j

  for (i = 0; i < t; i++) {
    c = 0
    for (j = 0; j < n; j++) {
      c = ip(r, i + j, x[j], y[i], c)
    }
    r[i + n] = c
  }

  return zclip(r)
}

function toppart (x, start, len) {
  let n = 0
  while (start >= 0 && len-- > 0) n = n * bx2 + x[start--]
  return n
}

// Multiple-precision division, HAC Algorithm 14.20
function bdiv (a, b) {
  let n = a.length - 1
  const t = b.length - 1
  let nmt = n - t
  let x, qq, xx
  let i

  // trivial cases; a < b
  if (n < t || (n === t && (a[n] < b[n] || (n > 0 && a[n] === b[n] && a[n - 1] < b[n - 1])))) {
    globalState.q = [0]
    globalState.mod = a
    return globalState
  }

  // trivial cases; q < 4
  if (n === t && toppart(a, t, 2) / toppart(b, t, 2) < 4) {
    x = a.concat()
    qq = 0
    for (;;) {
      xx = bsub(x, b)
      if (xx.length === 0) break
      x = xx; qq++
    }
    globalState.q = [qq]
    globalState.mod = x
    return globalState
  }

  // normalize
  const shift2 = Math.floor(Math.log(b[t]) / log2) + 1
  const shift = bs - shift2

  x = a.concat()
  const y = b.concat()

  if (shift) {
    for (i = t; i > 0; i--) y[i] = ((y[i] << shift) & bm) | (y[i - 1] >> shift2)
    y[0] = (y[0] << shift) & bm
    if (x[n] & ((bm << shift2) & bm)) {
      x[++n] = 0; nmt++
    }
    for (i = n; i > 0; i--) x[i] = ((x[i] << shift) & bm) | (x[i - 1] >> shift2)
    x[0] = (x[0] << shift) & bm
  }

  let x2
  const q = zeros(nmt + 1)
  let y2 = zeros(nmt).concat(y)
  for (;;) {
    x2 = bsub(x, y2)
    if (x2.length === 0) break
    q[nmt]++
    x = x2
  }

  const yt = y[t]
  const top = toppart(y, t, 2)
  let m
  for (i = n; i > t; i--) {
    m = i - t - 1
    if (i >= x.length) {
      q[m] = 1
    } else if (x[i] === yt) {
      q[m] = bm
    } else {
      q[m] = Math.floor(toppart(x, i, 2) / yt)
    }

    const topx = toppart(x, i, 3)
    while (q[m] * top > topx) q[m]--

    // x-=q[m]*y*b^m
    y2 = y2.slice(1)
    x2 = bsub(x, bmul([q[m]], y2))
    if (x2.length === 0) {
      q[m]--
      x2 = bsub(x, bmul([q[m]], y2))
    }
    x = x2
  }
  // de-normalize
  if (shift) {
    for (i = 0; i < x.length - 1; i++) x[i] = (x[i] >> shift) | ((x[i + 1] << shift2) & bm)
    x[x.length - 1] >>= shift
  }

  globalState.q = zclip(q)
  globalState.mod = zclip(x)
  return globalState
}

// returns the mod where m < 2^bd
function simplemod (i, m) {
  let c = 0
  let v
  for (let n = i.length - 1; n >= 0; n--) {
    v = i[n]
    c = ((v >> bd) + (c << bd)) % m
    c = ((v & bdm) + (c << bd)) % m
  }
  return c
}

function bmod (p, m) {
  if (m.length === 1) {
    if (p.length === 1) return [p[0] % m[0]]
    if (m[0] < bdm) return [simplemod(p, m[0])]
  }

  const r = bdiv(p, m)
  return r.mod
}

// Barrett's modular reduction, HAC Algorithm 14.42

function bmod2 (x, m, mu) {
  const xl = x.length - (m.length << 1)
  if (xl > 0) return bmod2(x.slice(0, xl).concat(bmod2(x.slice(xl), m, mu)), m, mu)

  const ml1 = m.length + 1
  const ml2 = m.length - 1
  let rr
  const q3 = bmul(x.slice(ml2), mu).slice(ml1)
  const r1 = x.slice(0, ml1)
  const r2 = bmul(q3, m).slice(0, ml1)
  let r = bsub(r1, r2)

  if (r.length === 0) {
    r1[ml1] = 1
    r = bsub(r1, r2)
  }
  for (let n = 0; ;n++) {
    rr = bsub(r, m)
    if (rr.length === 0) break
    r = rr
    if (n >= 3) return bmod2(r, m, mu)
  }
  return r
}

// Modular exponentiation using Barrett reduction

function bmodexp (g, e, m) {
  let a = g.concat()
  let l = e.length - 1
  let n = m.length * 2
  let mu = zeros(n + 1)
  mu[n] = 1
  mu = bdiv(mu, m).q

  n = nbits(e[l]) - 2

  for (; l >= 0; l--) {
    for (; n >= 0; n -= 1) {
      a = bmod2(bsqr(a), m, mu)
      if (e[l] & (1 << n)) a = bmod2(bmul(a, g), m, mu)
    }
    n = bs - 1
  }
  return a
}

// Compute m**d mod p*q for RSA private key operations.

function RSAdecrypt (m, d, p, q, u) {
  const xp = bmodexp(bmod(m, p), bmod(d, bsub(p, [1])), p)
  const xq = bmodexp(bmod(m, q), bmod(d, bsub(q, [1])), q)

  let t = bsub(xq, xp)
  if (t.length === 0) {
    t = bsub(xp, xq)
    t = bmod(bmul(t, u), q)
    t = bsub(q, t)
  } else {
    t = bmod(bmul(t, u), q)
  }
  return badd(bmul(t, p), xp)
}

// -----------------------------------------------------------------
// conversion functions: num array <-> multi precision integer (mpi)
// mpi: 2 octets with length in bits + octets in big endian order

function mpi2b (s) {
  let bn = 1
  const r = [0]
  let rn = 0
  let sb = 256
  let sn = s.length
  let c

  if (sn < 2) return 0

  const len = (sn - 2) * 8
  const bits = s.charCodeAt(0) * 256 + s.charCodeAt(1)
  if (bits > len || bits < len - 8) return 0

  for (let n = 0; n < len; n++) {
    if ((sb <<= 1) > 255) {
      sb = 1
      c = s.charCodeAt(--sn)
    }
    if (bn > bm) {
      bn = 1
      r[++rn] = 0
    }
    if (c & sb) r[rn] |= bn
    bn <<= 1
  }
  return r
}

function b2s (b) {
  let bn = 1
  let bc = 0
  const r = [0]
  let rb = 1
  let rn = 0
  const bits = b.length * bs
  let rr = ''
  let n

  for (n = 0; n < bits; n++) {
    if (b[bc] & bn) r[rn] |= rb
    if ((rb <<= 1) > 255) {
      rb = 1
      r[++rn] = 0
    }
    if ((bn <<= 1) > bm) {
      bn = 1
      bc++
    }
  }

  while (rn >= 0 && r[rn] === 0) rn--
  for (n = 0; n <= rn; n++) rr = String.fromCharCode(r[n]) + rr
  return rr
}

/**
 * cryptoDecodePrivKey
 * @public
 * @argv privk Buffer Private key
 * @return Private Key
 * @source https://github.com/meganz/webclient/blob/542d98ec61340b1e4fbf0dae0ae457c1bc5d49aa/js/crypto.js#L1448
 */
function cryptoDecodePrivKey (privk) {
  const pubkey = []

  // decompose private key
  for (let i = 0; i < 4; i++) {
    const l = ((privk[0] * 256 + privk[1] + 7) >> 3) + 2
    pubkey[i] = mpi2b(privk.toString('binary').substr(0, l))
    if (typeof pubkey[i] === 'number') {
      if (i !== 4 || privk.length >= 16) return false
      break
    }
    privk = privk.slice(l)
  }

  return pubkey
}

/**
 * cryptoRsaDecrypt
 * @public
 * @argv ciphertext Buffer
 * @argv privkey Private Key
 * @return Buffer Decrypted plaintext
 * @source https://github.com/meganz/webclient/blob/4d95863d2cdbfb7652d16acdff8bae4b64056549/js/crypto.js#L1468
 */
function cryptoRsaDecrypt (ciphertext, privkey) {
  const integerCiphertext = mpi2b(ciphertext.toString('binary'))
  const plaintext = b2s(RSAdecrypt(integerCiphertext, privkey[2], privkey[0], privkey[1], privkey[3]))
  return Buffer.from(plaintext, 'binary')
}

export { cryptoDecodePrivKey, cryptoRsaDecrypt }
