import test from 'ava'
import { testBuffer, stream2cb } from './test-utils.js'
import mega from '../lib/mega'

// encrypt - decrypt
test.cb('MEGA encrypt/decrypt streams', t => {
  t.plan(5)

  const size = 151511
  const d0 = testBuffer(size)
  const d0e = new Buffer(d0)
  const key = testBuffer(24, 100, 7)
  const encrypt = mega.encrypt(key)

  stream2cb(encrypt, (err, buffer) => {
    t.ifError(err)
    t.is(encrypt.key.toString('hex'), 'b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2')

    // Correct decrypt.
    const decryptPass = mega.decrypt(encrypt.key)
    stream2cb(decryptPass, function (err, buffer) {
      t.ifError(err)
      t.deepEqual(d0, buffer)
    })
    decryptPass.end(buffer)

    // Invalid mac.
    const k2 = new Buffer(encrypt.key)
    k2[15] = ~k2[15] // flip one mac byte.

    const decryptFail = mega.decrypt(encrypt.key)
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
