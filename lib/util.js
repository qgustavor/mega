var request = require('request')
var through = require('through')

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

// duplex stream that emits chunks in correct sizes.
// non optimal: it would be faster to tweak crc algorithm.
// 0 / 128K / 384K / 768K / 1280K / 1920K / 2688K / 3584K / 4608K / ... (every 1024 KB) / EOF
exports.resizeChunks = function() {
  var buffers = []
  var increment = 131072 // 2**17
  var pos = 0
  var posNext = increment
  var offset = 0
  var s = through(function(d) {
    var slice
    var i = 0
    while (i < d.length)
    if (i + offset + d.length > posNext) {
      slice = d.slice(i, posNext - offset - i)
      if (buffers.length) {
        buffers.push(slice)
        s.emit('data', Buffer.concat(buffers))
        buffers = []
      }
      else {
        s.emit('data', slice)
      }
      pos = posNext
      if (increment < 1048576) increment += 131072
      posNext += increment
      i += slice.length
    }
    else {
      buffers.push(d.slice(i))
      break
    }
    offset += d.length
  }, function() {
    if (buffers.length) s.emit('data', Buffer.concat(buffers))
    s.emit('end')
  })
  s.pause = null
  return s
}