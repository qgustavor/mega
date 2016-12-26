import test from 'ava'
import { testBuffer } from './test-utils.js'

import { prepareKey, AES } from '../lib/crypto'

test('stringhash', t => {
  const derivedKey = prepareKey(testBuffer(16))
  const aes = new AES(derivedKey)
  const emailBuffer = testBuffer(16)

  const hash = aes.stringhash(emailBuffer)
  const hashAsString = hash.toString('hex')

  t.is(hashAsString, 'bd6f9a37ccae855d')
})
