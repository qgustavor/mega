var request = require('request')

exports.API = API

function API() {
  this.counterId = Math.random().toString().substr(2, 10)
}

API.gateway = 'https://g.api.mega.co.nz/'

// Client-server request
API.prototype.request = function(json, cb) {
  var qs = {id: this.counterId++}
  if (this.sid) {
    qs.sid = this.sid
  }
  request({
    url: API.gateway + 'cs',
    qs: qs,
    method: 'POST',
    json: [json]
  }, function(err, req, json) {
    // todo: parse numeric error codes
    cb(err, json[0])
  })
}