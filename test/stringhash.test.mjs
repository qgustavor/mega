import test from 'ava'
import { testBuffer } from './test-utils.mjs'

import { prepareKey, AES } from '../lib/crypto/index.mjs'

const derivedKey = prepareKey(testBuffer(8))
const aes = new AES(derivedKey)

test('stringhash - 10 byte email', t => {
  const emailBuffer = testBuffer(10)
  const hash = aes.stringhash(emailBuffer)
  const hashAsString = hash.toString('hex')

  t.is(hashAsString, '9e791646c66840b5')
})

test('stringhash - 16 byte email', t => {
  const emailBuffer = testBuffer(16)
  const hash = aes.stringhash(emailBuffer)
  const hashAsString = hash.toString('hex')

  t.is(hashAsString, '6ba07aca224e84a4')
})

test('stringhash - 32 byte email', t => {
  const emailBuffer = testBuffer(32)
  const hash = aes.stringhash(emailBuffer)
  const hashAsString = hash.toString('hex')

  t.is(hashAsString, '6a1e6c5539c0ed48')
})
