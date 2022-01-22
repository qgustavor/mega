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

function detectSize (cb) {
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
      for (const chunk of chunks) this.push(chunk)
      callback()
    }
  })
}

function pauseStream (isPaused) {
  let lastCallback

  const pause = new Transform({
    transform (chunk, encoding, callback) {
      if (isPaused) {
        lastCallback = () => callback(null, chunk)
      } else {
        callback(null, chunk)
      }
    }
  })

  pause.setPause = state => {
    isPaused = state
    if (!isPaused && lastCallback) {
      lastCallback()
      lastCallback = null
    }
  }

  return pause
}

export { streamToCb, chunkSizeSafe, detectSize, pauseStream }
