var crypto = require('./crypto')
var util = require('./util')

function mega(email, pass, cb) {

}

mega.file = function(opt) {
  return new File(opt)
}


function File(opt) {
  // todo: parse url
  this.downloadId = opt.downloadId
  this.nodeId = opt.nodeId
  this.key = crypto.formatKey(opt.key)
  this.name = opt.name
  this.size = opt.size
}

File.prototype.getCipher = function() {
  if (!this._cipher) {
    // 256 -> 128
    var key = new Buffer(16)
    for (var i = 0; i < 16; i++) {
      key[i] = this.key[i] ^ this.key[16 + i]
    }
    this._cipher = new crypto.AES(key)
  }
  return this._cipher
}

File.prototype.loadAttributes = function(cb) {
  var req = {a: 'g', p: this.downloadId} // todo: nodeId version ('n')
  var self = this
  util.cs(req, function(err, response) {
    if (err) return cb(err)

    self.size = response.s

    var aes = self.getCipher()

    console.log(response)

  })
}

File.prototype.download = function(cb) {

}




module.exports = mega