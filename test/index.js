var assert = require('assert')
var crypto = require('../lib/crypto')

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
var d0e = Buffer.concat([d0])
aes.encrypt_cbc(d0e)
var enc = 'CpQLtUFu8EXxw5RYxlPqWjz0VrTKSIqjg8ecmLNHl8t+Fj4w6knTIVKlGgihDsAtZ3/0yl3UaW51mBxxKDeZwrD0BlwLq97MM7cR+I9ZTpjTTb8rbaBYTDfP4RMEgGnBX1RmsKHIZBNvqw9jlid+TK2Ewq33CQz8ZDoYDd5BDue2EjsXefLSuCkZk5ZxN09epjk/IC7IG95ftHjGtdfmqg=='
assert.equal(d0e.toString('base64'), enc)
var d0d = Buffer.concat([d0e])
aes.decrypt_cbc(d0e)
assert.equal(d0, d0d)


