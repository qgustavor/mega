import crypto from 'crypto'

export function stream2cb (stream, cb) {
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

// Generate buffer with specific size.
export function testBuffer (size, start = 0, step = 1) {
  const buffer = Buffer.alloc(size)
  for (let i = 0; i < size; i++) {
    buffer[i] = (start + i * step) % 255
  }
  return buffer
}

// Helper for getting hex-sha1 for a buffer.
export function sha1 (buf) {
  const shasum = crypto.createHash('sha1')
  shasum.update(buf)
  return shasum.digest('hex')
}
