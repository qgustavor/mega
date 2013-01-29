var request = require('request')
var crypto = require('./crypto')
var API = require('./api').API
var mega = require('./mega')

var api = new API

exports.File = File

function File(opt) {
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
  api.request(req, function(err, response) {
    if (err) return cb(err)

    self.size = response.s

    var at = new Buffer(crypto.base64Clean(response.at), 'base64')
    self._getCipher(self.key).decrypt_cbc(at)

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

  api.request(req, function(err, response) {
    if (err) return stream.emit('error', err)

    //console.log(response.g)
    var r = request(response.g)
    r.pipe(stream)
    var i = 0
    r.on('data', function(d) {
      i += d.length
      stream.emit('progress', {bytesLoaded: i, bytesTotal: response.s})
    })
  })

  cb && util.stream2cb(stream, cb)
  return stream
}

