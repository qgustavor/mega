import test from 'ava'
import { testBuffer, stream2promise, sha1 } from './helpers/test-utils.mjs'
import { encrypt as megaEncrypt, decrypt as megaDecrypt } from '../dist/main.node-es.mjs'

// encrypt - decrypt
test('MEGA encrypt/decrypt streams', async t => {
  const size = 151511
  const d0 = testBuffer(size)
  const d0e = Buffer.from(d0)
  const d0sha = sha1(d0e)
  const key = testBuffer(24, 100, 7)
  const encrypt = megaEncrypt(key)
  let buffer

  encrypt.write(d0e.slice(0, 50000))
  encrypt.write(d0e.slice(50000, 100000))
  encrypt.end(d0e.slice(100000, size))

  buffer = await stream2promise(encrypt)
  t.is(encrypt.key.toString('hex'), 'b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2')
  t.is(sha1(buffer), 'addb96c07ac4e6b66316b81530256c911b0b49d1')

  // Correct decrypt.
  const decryptPass = megaDecrypt(encrypt.key)
  decryptPass.end(buffer)

  buffer = await stream2promise(decryptPass)
  t.is(sha1(buffer), d0sha)

  // Invalid mac.
  const k2 = Buffer.from(encrypt.key)
  k2[15] = ~k2[15] // flip one mac byte.

  try {
    const decryptFail = megaDecrypt(encrypt.key)
    decryptFail.end(buffer)
    await stream2promise(decryptFail)

    throw Error('Stream resolved instead of throwing')
  } catch (error) {
    t.is(error.message, 'MAC verification failed')
  }
})

test('MEGA mid-stream decrypt', async t => {
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

  // Create a stream encrypting the original chunk many times
  for (let i = 0; i < chunks; i++) {
    encrypt.write(d0e)
  }

  // As the d0e buffers could be changed by the encrypt stream
  // add the original chunk at the end
  encrypt.end(Buffer.from(d0))

  const buffer = await stream2promise(encrypt)

  // After encrypting all the stream read the result
  const decryptPass = megaDecrypt(encrypt.key, { start })
  decryptPass.end(buffer.slice(start))

  const decryptBuffer = await stream2promise(decryptPass)
  const expected = d0.slice(chunkSize - testChunkSize).toString('hex')
  const got = decryptBuffer.toString('hex')
  t.is(expected, got)
})

test('Should not accept wrong key sizes', t => {
  t.throws(() => megaEncrypt(Buffer.alloc(10)), {
    message: 'Wrong key length. Key must be 192bit.'
  })
})
