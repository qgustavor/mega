var request = require('request')

var counterId = Math.random().toString().substr(2, 10)

var API_URL = 'https://g.api.mega.co.nz/'

// Client-server request
exports.cs = function(json, cb) {
  request({
    url: API_URL + 'cs',
    qs: {id: counterId++},
    method: 'POST',
    json: [json]
  }, function(err, req, json) {
    // todo: parse numeric error codes
    cb(err, json[0])
  })
}
