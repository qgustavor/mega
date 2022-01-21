import test from 'ava'
import { testBuffer, stream2cb, sha1 } from './helpers/test-utils.mjs'
import { encrypt as megaEncrypt, decrypt as megaDecrypt } from '../dist/main.node-es.mjs'

// encrypt - decrypt
test('MEGA encrypt/decrypt streams', t => {
  return new Promise(resolve => {
    const size = 151511
    const d0 = testBuffer(size)
    const d0e = Buffer.from(d0)
    const d0sha = sha1(d0e)
    const key = testBuffer(24, 100, 7)
    const encrypt = megaEncrypt(key)

    stream2cb(encrypt, (err, buffer) => {
      if (err) throw err
      t.is(encrypt.key.toString('hex'), 'b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2')
      t.is(sha1(buffer), 'addb96c07ac4e6b66316b81530256c911b0b49d1')

      // Correct decrypt.
      const decryptPass = megaDecrypt(encrypt.key)
      stream2cb(decryptPass, (err, buffer) => {
        t.falsy(err)
        t.is(sha1(buffer), d0sha)
      })
      decryptPass.end(buffer)

      // Invalid mac.
      const k2 = Buffer.from(encrypt.key)
      k2[15] = ~k2[15] // flip one mac byte.

      const decryptFail = megaDecrypt(encrypt.key)
      stream2cb(decryptFail, (err, buffer) => {
        t.truthy(err)
        resolve()
      })

      decryptFail.end(buffer)
    })

    encrypt.write(d0e.slice(0, 50000))
    encrypt.write(d0e.slice(50000, 100000))
    encrypt.end(d0e.slice(100000, size))
  })
})

test('MEGA mid-stream decrypt', t => {
  return new Promise((resolve, reject) => {
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
    stream2cb(encrypt, (error, buffer) => {
      if (error) return reject(error)

      // After encrypting all the stream read the result
      const decryptPass = megaDecrypt(encrypt.key, { start })
      stream2cb(decryptPass, (error, buffer) => {
        if (error) return reject(error)

        const expected = d0.slice(chunkSize - testChunkSize).toString('hex')
        const got = buffer.toString('hex')
        t.deepEqual(expected, got)
        resolve()
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
})
