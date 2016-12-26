import test from 'ava'
import { testBuffer } from './test-utils.js'

import { prepareKey } from '../lib/crypto'

test('prepareKey', t => {
  const derivedKey = prepareKey(testBuffer(16))
  const keyAsString = derivedKey.toString('hex')

  t.is(keyAsString, '474149b3e98d67e24713b4f42c7ee75c')
})
