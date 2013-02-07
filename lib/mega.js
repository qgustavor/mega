var parse = require('url').parse
var through = require('through')
var pipeline = require('stream-combiner')

var crypto = require('./crypto')
var util = require('./util')

function mega(email, pass, cb) {
  return new mega.Storage(email, pass, cb)
}

module.exports = mega

mega.file = function(opt) {
  if (typeof opt === 'string') {
    var url = parse(opt)

    var split
    if (url.host !== 'mega.co.nz' || !url.hash
      || (split = url.hash.split('!')).length != 3) {
        throw('Wrong URL supplied.')
    }
    opt = {downloadId: split[1], key: split[2]}
  }
  return new mega.File(opt)
}

mega.encrypt = function(key) {
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

mega.decrypt = function(key) {
  key = crypto.formatKey(key)

  var aes = mega.File.getCipher(key)

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


mega.Storage = require('./storage').Storage
mega.File = require('./file').File

