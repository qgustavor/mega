import test from 'ava'
import { testBuffer, stream2promise } from './helpers/test-utils.mjs'
import { verify } from '../dist/main.node-es.mjs'

test('MEGA verify stream', async t => {
  const size = 151511
  const d0 = testBuffer(size)
  const d0e = Buffer.from(d0)
  const key = Buffer.from('AAAAAAAAAABnFCfbJFwAxwAAAAAAAAAAZxQn2yRcAMc', 'base64')
  const verifyStream = verify(key)

  verifyStream.write(d0e.slice(0, 50000))
  verifyStream.write(d0e.slice(50000, 100000))
  verifyStream.end(d0e.slice(100000, size))

  await stream2promise(verifyStream)
  t.is(verifyStream.mac.toString('hex'), '671427db245c00c7')
})

test('Should not accept wrong key sizes', t => {
  t.throws(() => verify(Buffer.alloc(10)), {
    message: 'Wrong key length. Key must be 256bit.'
  })
})
