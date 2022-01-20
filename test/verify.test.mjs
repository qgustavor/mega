import test from 'ava'
import { testBuffer, stream2cb } from './helpers/test-utils.mjs'
import { verify } from '../dist/main.node-es.mjs'

test('MEGA verify stream', t => {
  return new Promise((resolve, reject) => {
    const size = 151511
    const d0 = testBuffer(size)
    const d0e = Buffer.from(d0)
    const key = Buffer.from('AAAAAAAAAABnFCfbJFwAxwAAAAAAAAAAZxQn2yRcAMc', 'base64')
    const verifyStream = verify(key)

    stream2cb(verifyStream, (err) => {
      if (err) return reject(err)

      t.is(verifyStream.mac.toString('hex'), '671427db245c00c7')
      resolve()
    })

    verifyStream.write(d0e.slice(0, 50000))
    verifyStream.write(d0e.slice(50000, 100000))
    verifyStream.end(d0e.slice(100000, size))
  })
})
