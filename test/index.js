const assert = require('assert')
const mega = require('../dist/main.cjs.js')
const crypto = require('crypto')
const megaCrypto = mega.crypto

// todo: test this separately
function stream2cb (stream, cb) {
  var chunks = []
  var complete
  stream.on('data', function (d) {
    chunks.push(d)
  })
  stream.on('end', function () {
    if (!complete) {
      complete = true
      cb(null, Buffer.concat(chunks))
    }
  })
  stream.on('error', function (e) {
    if (!complete) {
      complete = true
      cb(e)
    }
  })
}

// Generate buffer with specific size.
function testBuffer (size, start, step) {
  start = start || 0
  step = step || 1

  var buffer = new Buffer(size)
  for (var i = 0; i < size; i++) {
    buffer[i] = (start + i * step) % 255
  }
  return buffer
}

// Helper for getting hex-sha1 for a buffer.
function sha (buf) {
  var shasum = crypto.createHash('sha1')
  shasum.update(buf)
  return shasum.digest('hex')
}

// A mini expectations module to ensure expected callback fire at all. via. @creationix
var expectations = {}
function expect (message) {
  expectations[message] = new Error('Missing expectation: ' + message)
}
function fulfill (message) {
  delete expectations[message]
}
process.on('exit', function () {
  Object.keys(expectations).forEach(function (message) {
    throw expectations[message]
  })
  console.log('All passed.')
})

// Tests start here:

testAES()
testMegaEncrypt()

// CBC
function testAES () {
  var aes = new megaCrypto.AES(testBuffer(16))
  var d0 = testBuffer(160)
  var d0e = new Buffer(d0)
  aes.encryptCBC(d0e)
  assert.equal(sha(d0e), 'cd9a7168ec42cb0cc1f2a18575ff7794b4b5a95d')
  var d0d = new Buffer(d0e)
  aes.decryptCBC(d0d)
  assert.deepEqual(d0, d0d)
}

// encrypt - decrypt
function testMegaEncrypt () {
  var size = 151511
  var d0 = testBuffer(size)
  var d0e = new Buffer(d0)
  var key = testBuffer(24, 100, 7)
  var encrypt = mega.encrypt(key)

  expect('encrypt callback')
  stream2cb(encrypt, function (err, buffer) {
    fulfill('encrypt callback')

    assert.equal(err, null)
    assert.equal(sha(encrypt.key), '560cabd8bf1dbb42911c9b599b0812f9f236a8a7')

    // Correct decrypt.
    var decrypt = mega.decrypt(encrypt.key)
    expect('valid decrypt callback')
    stream2cb(decrypt, function (err, buffer) {
      fulfill('valid decrypt callback')
      assert.equal(err, null)
      assert.deepEqual(d0, buffer)
    })
    decrypt.end(buffer)

    // Invalid mac.
    var k2 = new Buffer(encrypt.key)
    k2[15] = ~k2[15] // flip one mac byte.
    decrypt = mega.decrypt(encrypt.key)
    expect('invalid decrypt callback')
    stream2cb(decrypt, function (err, buffer) {
      fulfill('invalid decrypt callback')
      assert(err)
    })

    decrypt.end(buffer)
  })

  encrypt.write(d0e.slice(0, 50000))
  encrypt.write(d0e.slice(50000, 100000))
  encrypt.end(d0e.slice(100000, size))
}
