var crypto = require('./crypto')

var API_URL = 'https://g.api.mega.co.nz/'

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

File.prototype.loadAttributes = function(cb) {

}

File.prototype.download = function(cb) {

}




module.exports = mega