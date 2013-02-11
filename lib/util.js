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
  return s
}

exports.chunkSizeSafe = function(size) {
  var last
  return through(function(d) {
    if (last) d = Buffer.concat(last, d)

    var end = Math.ceil(d.length / size) * size

    if (d.length > end) {
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