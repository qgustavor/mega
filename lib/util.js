import through from 'through'

function streamToCb (stream, cb) {
  const chunks = []
  let complete
  stream.on('data', function (d) {
    chunks.push(d)
  })
  stream.on('end', function () {
    if (!complete) {
      complete = true
      cb(null, Buffer.concat(chunks))
    }
  })
  stream.on('error', function (e) {
    if (!complete) {
      complete = true
      cb(e)
    }
  })
}

function chunkSizeSafe (size) {
  let last
  return through(function (d) {
    if (last) d = Buffer.concat([last, d])

    const end = Math.floor(d.length / size) * size

    if (!end) {
      last = last ? Buffer.concat([last, d]) : d
    } else if (d.length > end) {
      last = d.slice(end)
      this.emit('data', d.slice(0, end))
    } else {
      last = undefined
      this.emit('data', d)
    }
  }, function () {
    if (last) this.emit('data', last)
    this.emit('end')
  })
}

function detectSize (cb) {
  const chunks = []
  let size = 0

  return through((d) => {
    chunks.push(d)
    size += d.length
  }, function () {
    // function IS needed
    cb(size)
    chunks.forEach(this.emit.bind(this, 'data'))
    this.emit('end')
  })
}

export { streamToCb, chunkSizeSafe, detectSize }
