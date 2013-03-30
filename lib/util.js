var through = require('through')

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

exports.chunkSizeSafe = function(size) {
  var last
  return through(function(d) {
    if (last) d = Buffer.concat([last, d])

    var end = Math.floor(d.length / size) * size

    if (!end) {
      last = last ? Buffer.concat([last, d]) : d
    }
    else if (d.length > end) {
      last = d.slice(end)
      this.emit('data', d.slice(0, end))
    }
    else {
      last = undefined
      this.emit('data', d)
    }
  }, function() {
    if (last) this.emit('data', last)
    this.emit('end')
  })
}

exports.detectSize = function(cb) {
  var chunks = []
  var size = 0
  return through(function(d) {
    chunks.push(d)
    size += d.length
  }, function() {
    cb(size)
    chunks.forEach(this.emit.bind(this, 'data'))
    this.emit('end')
  })
}