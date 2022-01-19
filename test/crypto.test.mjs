import test from 'ava'
import { testBuffer, sha1 } from './test-utils.mjs'

import { AES } from '../lib/crypto/index.mjs'

test('AES-CBC', t => {
  const aes = new AES(testBuffer(16))
  const d0 = testBuffer(160)
  const d0e = Buffer.from(d0)

  aes.encryptCBC(d0e)
  t.is(sha1(d0e), 'cd9a7168ec42cb0cc1f2a18575ff7794b4b5a95d')

  const d0d = Buffer.from(d0e)
  aes.decryptCBC(d0d)
  t.deepEqual(d0, d0d)
})

test('AES wrong key size', t => {
  let aes

  t.throws(() => {
    aes = new AES(testBuffer(8))
  }, {
    message: 'Wrong key length. Key must be 128bit.'
  })
  t.throws(() => {
    aes = new AES(testBuffer(32))
  }, {
    message: 'Wrong key length. Key must be 128bit.'
  })

  t.falsy(aes)
})
