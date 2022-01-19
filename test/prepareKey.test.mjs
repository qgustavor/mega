import test from 'ava'
import { testBuffer } from './test-utils.mjs'

import { prepareKey } from '../lib/crypto/index.mjs'

test('prepareKey - small - 8 bytes', t => {
  const derivedKey = prepareKey(testBuffer(8))
  const keyAsString = derivedKey.toString('hex')

  t.is(keyAsString, 'c4589a459956887caf0b408635c3c03b')
})

test('prepareKey - long - 64 bytes', t => {
  const derivedKey = prepareKey(testBuffer(64))
  const keyAsString = derivedKey.toString('hex')

  t.is(keyAsString, '83bd84689f057f9ed9834b3ecb81d80e')
})
