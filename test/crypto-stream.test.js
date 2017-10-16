import test from 'ava'
import { testBuffer, stream2cb } from './test-utils.js'
import { megaEncrypt, megaDecrypt } from '../lib/crypto'

// encrypt - decrypt
test.cb('MEGA encrypt/decrypt streams', t => {
  t.plan(5)

  const size = 151511
  const d0 = testBuffer(size)
  const d0e = Buffer.from(d0)
  const key = testBuffer(24, 100, 7)
  const encrypt = megaEncrypt(key)

  stream2cb(encrypt, (err, buffer) => {
    t.ifError(err)
    t.is(encrypt.key.toString('hex'), 'b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2')

    // Correct decrypt.
    const decryptPass = megaDecrypt(encrypt.key)
    stream2cb(decryptPass, function (err, buffer) {
      t.ifError(err)
      t.deepEqual(d0, buffer)
    })
    decryptPass.end(buffer)

    // Invalid mac.
    const k2 = Buffer.from(encrypt.key)
    k2[15] = ~k2[15] // flip one mac byte.

    const decryptFail = megaDecrypt(encrypt.key)
    stream2cb(decryptFail, function (err, buffer) {
      t.truthy(err)
      t.end()
    })

    decryptFail.end(buffer)
  })

  encrypt.write(d0e.slice(0, 50000))
  encrypt.write(d0e.slice(50000, 100000))
  encrypt.end(d0e.slice(100000, size))
})

test.cb('MEGA mid-stream decrypt', t => {
  t.plan(3)

  // Create chunk buffer
  const chunkSize = 1024
  const d0 = testBuffer(chunkSize)
  const d0e = Buffer.from(d0)

  // Set some variables
  const chunks = 1024
  const testChunkSize = 128
  const start = (chunks + 1) * chunkSize - testChunkSize

  // Generate an encrypt transform stream
  const encrypt = megaEncrypt()
  stream2cb(encrypt, (err, buffer) => {
    t.ifError(err)

    // After encrypting all the stream read the result
    const decryptPass = megaDecrypt(encrypt.key, { start })
    stream2cb(decryptPass, (err, buffer) => {
      t.ifError(err)

      const expected = d0.slice(chunkSize - testChunkSize).toString('hex')
      const got = buffer.toString('hex')
      t.deepEqual(expected, got)
      t.end()
    })

    decryptPass.end(buffer.slice(start))
  })

  // Create a stream encrypting the original chunk many times
  for (let i = 0; i < chunks; i++) {
    encrypt.write(d0e)
  }

  // As the d0e buffers could be changed by the encrypt stream
  // add the original chunk at the end
  encrypt.end(Buffer.from(d0))
})
