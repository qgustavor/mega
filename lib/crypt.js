var through = require('through')
var pipeline = require('stream-combiner')

var crypto = require('./crypto')
var util = require('./util')

exports.encrypt = function(key) {
  key = crypto.formatKey(key)

  if (!key) {
    key = require('crypto').randomBytes(24)
  }

  var stream = through(write, end)

  if (key.length != 24) {
    return process.nextTick(function() {
      stream.emit('error', new Error('Wrong key length. Key must be 192bit.'))
    })
  }

  var aes = new crypto.AES(key.slice(0, 16))

  var macs = []
  var pos = 0
  function write(d) {
    macs.push(aes.encrypt_ctr_mac(d, [key.readInt32BE(16), key.readInt32BE(20)], pos))
    pos += d.length
    this.emit('data', d)
  }

  function end() {
    var mac = aes.condenseMacs(macs)

    var newkey = new Buffer(32)
    key.copy(newkey)
    newkey.writeInt32BE(mac[0]^mac[1], 24)
    newkey.writeInt32BE(mac[2]^mac[3], 28)
    for (var i = 0; i < 16; i++) {
      newkey[i] = newkey[i] ^ newkey[16 + i]
    }
    stream.key = newkey
    this.emit('end')
  }

  return stream = pipeline(util.resizeChunks(), stream)
}

exports.decrypt = function(key) {
  key = crypto.formatKey(key)

  var aes = File.prototype._getCipher(key)

  var stream = through(write, end)

  var macs = []
  var pos = 0
  function write(d) {
    macs.push(aes.decrypt_ctr_mac(d, [key.readInt32BE(16), key.readInt32BE(20)], pos))
    pos += d.length
    this.emit('data', d)
  }

  function end() {
    var mac = aes.condenseMacs(macs)
    if ((mac[0]^mac[1]) != key.readInt32BE(24) || (mac[2]^mac[3]) != key.readInt32BE(28)) {
      return this.emit('error', new Error('MAC verification failed'))
    }
    this.emit('end')
  }

  return pipeline(util.resizeChunks(), stream)
}
