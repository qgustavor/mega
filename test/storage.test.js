import test from 'ava'
import nock from 'nock'

import { testBuffer } from './test-utils.js'
import { prepareKey, e64, AES } from '../lib/crypto'
import crypto from 'crypto'

import Storage from '../lib/Storage'

// Connections outside testing scope aren't permitted
nock.disableNetConnect()

test('Should throw when `email` is not defined', t => {
  let storage
  const error = t.throws(() => {
    storage = new Storage({})
  }, Error)

  t.falsy(storage)
  t.is(error.message, "starting a session without credentials isn't supported")
})

// SKIPPED: for some reason `storage` turns to be undefined inside the callback
test.skip.cb('Should not do any request when `autologin` is false', t => {
  const storage = new Storage({
    email: 'test-account@example.com',
    password: 'test-password',
    autologin: false
  }, (error, result) => {
    t.ifError(error)
    t.is(result, storage)
    t.end()
  })

  t.true(storage instanceof Storage)
})

// SKIPPED: cannot continue until the test above passes
test.skip.cb('Should login normally', t => {
  // construct expected server response
  const testEmail = 'test-account@example.com'

  // from prepareKey.test.js
  const derivatedKey = new Buffer('c4589a459956887caf0b408635c3c03b', 'hex')
  const testAesKey = testBuffer(8)
  const generatedUh = e64(new AES(derivatedKey).stringhash(Buffer.from(testEmail)))

  // Some random generated private key
  const rsaKey = new Buffer('A private RSA key, formatted in MEGA format', 'base64')

  // AES key, encrypted with AES key generated from password
  const k = e64(crypto.createCipheriv('aes-128-ecb', derivatedKey, Buffer.alloc(0))
  .setAutoPadding(false)
  .update(testAesKey))

  // base64 encoded, AES encrypted RSA private key
  const privk = e64(crypto.createCipheriv('aes-128-ecb', derivatedKey, Buffer.alloc(0))
  .setAutoPadding(false)
  .update(rsaKey))

  // base64 encoded, RSA encrypted server auth key
  const testSid = 'test-sid'
  const csid = 'The testSid encrypted with the random key above'

  nock('https://g.api.mega.co.nz:443')
    .replyContentLength()
    .post('/cs', [{
      a: 'us',
      user: testEmail,
      uh: generatedUh
    }])
    .query((query) => Number.isInteger(query.id))
    .reply(200, [{ csid, privk, k }])

  nock('https://g.api.mega.co.nz:443')
    .replyContentLength()
    .post('/cs', [{ a: 'ug' }])
    .query((query) => Number.isInteger(query.id) && query.sid === testSid)
    .reply(200, [{
      u: 'test-user',
      name: 'Test User'
    }])

  const storage = new Storage({
    email: testEmail,
    password: prepareKey(8),
    autoload: false
  }, (error, result) => {
    t.ifError(error)

    t.is(result, storage)
    t.is(storage.name, 'Test User')
    t.is(storage.user, 'test-user')

    t.end()
  })

  t.true(storage instanceof Storage, 'storage is not an instance of Storage')
})
