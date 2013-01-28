var request = require('request')
var through = require('through')
var crypto = require('./crypto')
var util = require('./util')

function mega(email, pass, cb) {

}

mega.file = function(opt) {
  return new File(opt)
}

mega.encrypt = function() {

}

mega.decrypt = function(key) {
  key = crypto.formatKey(key)

  var aes = File.prototype._getCipher(key)

  var stream = through(write, end)

  function write(d) {
    this.emit('data', d)
  }

  function end() {
    this.emit('end')
  }

  return stream
}

function File(opt) {
  // todo: parse url
  this.downloadId = opt.downloadId
  this.nodeId = opt.nodeId
  this.key = crypto.formatKey(opt.key)
  this.name = opt.name
  this.size = opt.size
}

File.prototype._getCipher = function(bigkey) {
  // 256 -> 128
  var key = new Buffer(16)
  for (var i = 0; i < 16; i++) {
    key[i] = bigkey[i] ^ bigkey[16 + i]
  }
  return new crypto.AES(key)
}

File.prototype.loadAttributes = function(cb) {
  var req = {a: 'g', p: this.downloadId} // todo: nodeId version ('n')
  var self = this
  util.cs(req, function(err, response) {
    if (err) return cb(err)

    self.size = response.s

    var at = new Buffer(crypto.base64Clean(response.at), 'base64')
    self._getCipher(this.key).decrypt_cbc(at)

    // remove empty bytes from end
    var end = at.length
    while (!at[end - 1]) end--

    at = at.slice(0, end).toString()

    if (at.substr(0,6) != 'MEGA{"') {
      return cb(new Error('incorrect response'))
    }

    try {
      at = JSON.parse(at.substring(4));
    } catch (e) {
      return cb(new Error('malformed attributes'))
    }

    self.attributes = at
    self.name = at.n

    cb(null, self)

  })
}

File.prototype.download = function(cb) {
  var req = {a: 'g', g: 1}
  if (this.nodeId) {
    req.n = this.nodeId
  }
  else {
    req.p = this.downloadId
  }

  var stream = mega.decrypt(this.key)

  util.cs(req, function(err, response) {
    if (err) return stream.emit('error', err)

    console.log(response.g)
    request(response.g).pipe(stream)
  })

  cb && util.stream2cb(stream, cb)
  return stream
}




module.exports = mega