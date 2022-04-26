import { Transform } from 'stream'

function streamToCb (stream, cb) {
  const chunks = []
  let complete
  stream.on('data', d => chunks.push(d))
  stream.on('end', () => {
    if (!complete) {
      complete = true
      cb(null, Buffer.concat(chunks))
    }
  })
  stream.on('error', e => {
    if (!complete) {
      complete = true
      cb(e)
    }
  })
}

function chunkSizeSafe (size) {
  let last

  return new Transform({
    transform (chunk, encoding, callback) {
      if (last) chunk = Buffer.concat([last, chunk])

      const end = Math.floor(chunk.length / size) * size
      if (!end) {
        last = last ? Buffer.concat([last, chunk]) : chunk
      } else if (chunk.length > end) {
        last = chunk.slice(end)
        this.push(chunk.slice(0, end))
      } else {
        last = undefined
        this.push(chunk)
      }
      callback()
    },
    flush (callback) {
      if (last) this.push(last)
      callback()
    }
  })
}

function detectSize (targetStream, cb) {
  const chunks = []
  let size = 0

  return new Transform({
    transform (chunk, encoding, callback) {
      chunks.push(chunk)
      size += chunk.length
      callback()
    },
    flush (callback) {
      cb(size)

      function handleChunk () {
        while (chunks.length) {
          const needDrain = !targetStream.write(chunks.shift())
          if (needDrain) return targetStream.once('drain', handleChunk)
        }
        targetStream.end()
        callback()
      }
      handleChunk()
    }
  })
}

// Based on https://github.com/morenyang/create-promise-callback/
function createPromise (originalCb) {
  let cb
  const promise = new Promise((resolve, reject) => {
    cb = (err, arg) => {
      if (err) return reject(err)
      resolve(arg)
    }
  })

  if (originalCb) {
    promise.then(arg => originalCb(null, arg), originalCb)
  }

  return [cb, promise]
}

export { streamToCb, chunkSizeSafe, detectSize, createPromise }
