import { crypto } from 'https://cdn.deno.land/std/versions/0.122.0/raw/crypto/mod.ts'
import { Buffer } from 'https://cdn.deno.land/std/versions/0.122.0/raw/node/buffer.ts'
import { encode as hexEncode } from 'https://cdn.deno.land/std/versions/0.122.0/raw/encoding/hex.ts'

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

export function stream2promise (stream) {
  const chunks = []
  let complete

  return new Promise((resolve, reject) => {
    stream.on('data', function (d) {
      chunks.push(d)
    })
    stream.on('end', function () {
      if (!complete) {
        complete = true
        resolve(Buffer.concat(chunks))
      }
    })
    stream.on('error', function (e) {
      if (!complete) {
        complete = true
        reject(e)
      }
    })
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
  return new TextDecoder().decode(hexEncode(new Uint8Array(crypto.subtle.digestSync('SHA-1', buf))))
}
