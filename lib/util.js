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

exports.stream2cb = function(stream, cb) {
  var chunks = []
  var complete
  stream.on('data', function(d) {
    chunks.push(d)
  })
  stream.on('end', function() {
    if (!complete) {
      complete = true
      cb(null, Buffer.concat(chunks))
    }
  })
  stream.on('error', function(e) {
    if (!complete) {
      complete = true
      cb(e)
    }
  })
}