var assert = require('assert')
var crypto = require('../lib/crypto')
var node_crypto = require('crypto')
var mega = require('../lib/mega')
var util = require('../lib/util')

// Generate buffer with specific size.
function randBuffer(size, start, step) {
  start = start || 0
  step = step || 1

  var buffer = new Buffer(size)
  for (var i = 0; i < size; i++) {
    buffer[i] = (start + i * step) % 255
  }
  return buffer
}

// Helper for getting hex-sha1 for a buffer.
function sha(buf) {
  var shasum = node_crypto.createHash('sha1')
  shasum.update(buf.toString('binary'))
  return shasum.digest('hex')
}

// A mini expectations module to ensure expected callback fire at all.
// via. @creationix
var expectations = {};
function expect(message) {
  expectations[message] = new Error("Missing expectation: " + message);
}
function fulfill(message) {
  delete expectations[message];
}
process.addListener('exit', function () {
  Object.keys(expectations).forEach(function (message) {
    throw expectations[message];
  });
  console.log('All passed.')
});


// Tests start here:

// CBC
var aes = new crypto.AES(randBuffer(16))
var d0 = randBuffer(160)
var d0e = new Buffer(d0)
aes.encryptCBC(d0e)
assert.equal(sha(d0e), 'cd9a7168ec42cb0cc1f2a18575ff7794b4b5a95d')
var d0d = new Buffer(d0e)
aes.decryptCBC(d0d)
assert.deepEqual(d0, d0d)


// encrypt - decrypt
var size = 151511
var d0 = randBuffer(size)
var d0e = new Buffer(d0)
var key = randBuffer(24, 100, 7)
var encrypt = mega.encrypt(key)

expect('encrypt callback')
util.stream2cb(encrypt, function(err, buffer) {
  fulfill('encrypt callback')

  assert.equal(sha(encrypt.key), '560cabd8bf1dbb42911c9b599b0812f9f236a8a7')
  // Correct decrypt.
  var decrypt = mega.decrypt(encrypt.key)
  expect('valid decrypt callback')
  util.stream2cb(decrypt, function(err, buffer) {
    fulfill('valid decrypt callback')
    assert.equal(err, null)
    assert.deepEqual(d0, buffer)
  })
  decrypt.end(buffer)

  // Invalid mac.
  var k2 = new Buffer(encrypt.key)
  k2[15] = ~k2[15] // flip one mac byte.
  var decrypt = mega.decrypt(encrypt.key)
  expect('invalid decrypt callback')
  util.stream2cb(decrypt, function(err, buffer) {
    fulfill('invalid decrypt callback')
    assert(err)
  })
  decrypt.end(buffer)

})

encrypt.write(d0e.slice(0, 50000))
encrypt.write(d0e.slice(50000, 100000))
encrypt.end(d0e.slice(100000, size))
