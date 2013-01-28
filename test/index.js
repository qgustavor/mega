var assert = require('assert')
var crypto = require('../lib/crypto')
var mega = require('../lib/mega')
var util = require('../lib/util')

function randBuffer(size, start, step) {
  start = start || 0
  step = step || 1

  var buffer = new Buffer(size)
  for (var i = 0; i < size; i++) {
    buffer[i] = (start + i * step) % 255
  }
  return buffer
}


// CBC
var aes = new crypto.AES(randBuffer(16))
var d0 = randBuffer(160)
var d0e = new Buffer(d0)
aes.encrypt_cbc(d0e)
var enc = 'CpQLtUFu8EXxw5RYxlPqWjz0VrTKSIqjg8ecmLNHl8t+Fj4w6knTIVKlGgihDsAtZ3/0yl3UaW51mBxxKDeZwrD0BlwLq97MM7cR+I9ZTpjTTb8rbaBYTDfP4RMEgGnBX1RmsKHIZBNvqw9jlid+TK2Ewq33CQz8ZDoYDd5BDue2EjsXefLSuCkZk5ZxN09epjk/IC7IG95ftHjGtdfmqg=='
assert.equal(d0e.toString('base64'), enc)
var d0d = new Buffer(d0e)
aes.decrypt_cbc(d0d)
assert.deepEqual(d0, d0d)


// encrypt - decrypt
var d0 = randBuffer(150000)
var d0e = new Buffer(d0)
var encrypt = mega.encrypt()

util.stream2cb(encrypt, function(err, buffer) {
  var decrypt = mega.decrypt(encrypt.key)
  util.stream2cb(decrypt, function(err, buffer) {
    assert.equal(d0, buffer)
  })
})

encrypt.write(d0e.slice(0, 50000))
encrypt.write(d0e.slice(50000, 100000))
encrypt.end(d0e.slice(100000, 150000))
