import test from 'ava'
import nock from 'nock'

import { testBuffer } from './test-utils.js'
import { e64, AES } from '../lib/crypto'
import crypto from 'crypto'

import Storage from '../lib/storage'

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

test.cb('Should not do any request when `autologin` is false', t => {
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

test.cb('Should login to MEGA', t => {
  // Construct expected server response
  const testEmail = 'test@example'

  // Derived key from prepareKey.test.js
  const derivedKey = Buffer.from('c4589a459956887caf0b408635c3c03b', 'hex')
  const testAesKey = testBuffer(16)
  const generatedUh = e64(new AES(derivedKey).stringhash(Buffer.from(testEmail)))

  // A random generated private key, formatted in MEGA format
  // Generate using crypto_rsagenkey() then base64urlencode(crypto_encodeprivkey(rsakey))
  const rsaKey = Buffer.from('BADArVpnIjSIneMPcxe1zdPV1k8fnmwtM9nZ8hVnTAUOfwXHJRfkAVbCOHCKY9sW9sTCee1D8KbPViCNDgMJov8STWwAEPbAj7deDhAkCk_fmgFlJoJaXeET6QclYBuDAwFAOBS1-FGLloAA1cxuR-c6XjWaoFO42osBKPLsdOKffwQA1B0ZqmPdXuHk_Dy_8JG8IXWfhbzL1nRSNJHRTlzNKoZEc4H6gSkxAtSRj69jGYxqqg7fgKkC23gCHJLwzNPemQd-AgSm6-xeo5HqBciDeh2QwLhMSSdc1gtJMXCAQP6ltsKK62Zb2fa2b2vEJX1Of8487-7Mg1Yn2DaNhaq1lx8IAIMSTc4iDMoCWtdTJztSfoE2jarE0gMSp-YsHFrxGDS7XmQkzF-RAN-ncXWPL20KZT6fmJtaqkkuMCdAZthtaeGAIZ1aNOtxEdkeSDzv0vkSlXyF1qdJpXdOSaYMWEcoQ14LOOXmOPSDVKMcy3Dx-MsBUo7nKHTylWfZ7EVEdcS3k4uFFWNGatCYl9RXaCJXNLEke38Q17Ns-I8UEHx_7LxIQMr7mZVjmw2bTvHPkQ_cUJS3-xWiAozBn3ByTh21TQgeQRgtL8xvE-9TzylzSTeuIAWY1FLlfzcW3fe-lCDiaS61eKc7PTQQ0M7YJ8jOV03Q_vPzmjkF3LB5y3Hvuo0EAFdxAC6_Ll8agyyRCIsaCBI71b0PScT4AJC9120PE93A2ru0eGghNHWaLe0wD3LpWKdfFoAzozjRyYxw9PPGmZw5WNog6WyvFBoOk148Pppg4UmQHLuu3_9PwpgjHz-NdfRIX52at7tETFZqwenbUaG3VG9mQ3v2IcGzMzzxzUr4IhHnfwzYUX8', 'base64')

  // Account AES key, encrypted with the key generated from password
  const k = e64(crypto.createCipheriv('aes-128-ecb', derivedKey, Buffer.alloc(0))
    .setAutoPadding(false)
    .update(testAesKey))

  // RSA private key encrypted with account key, then base64 encoded
  const privk = e64(crypto.createCipheriv('aes-128-ecb', testAesKey, Buffer.alloc(0))
    .setAutoPadding(false)
    .update(rsaKey))

  // A ID used to authenticate with the server
  const testSid = 'megajs_test_sid_megajs_test_sid_megajs_test'
  const encodedSid = e64(Buffer.from(testSid))

  // csid is the testSid encrypted with the RSA key above, then base64 encoded
  // Generate using base64urlencode(crypto_rsaencrypt(testSid, rsakey))
  const csid = 'CABb-A-Dal4broC5Z78_lNwaiLXZ8UaOrcpAbDDrTYiFpdMtSTKRzAMMLVq5f0bmgr73chJ5usrrKbdd3y_w6YI4RBpfX3qKR2OyRyd22PKUoOCLFll8iVzybChe8cR1O-3HekEGB11oZVE5KhyTw9PGaqaWuxxOiJhFsGLvY5LVC52GCpMy9jrPK8uwf6K7CPp8qxoJLe9V6n_qVdZZdisSLc_uv4CT24VEQOwFvMAk4DNPzl4kgJQUwnIQXVozkWBHb3_JbZNALSvzUW0H6sD1ao2YWjp2JyVuJnOHH2nIn1lD33N5ltZ0mv85g81aEQBrmXfMjAQh73P7KzjzI5LU'

  // Mock connections using Nock
  nock('https://eu.api.mega.co.nz:443')
    .replyContentLength()
    .post('/cs', [{
      a: 'us',
      user: testEmail,
      uh: generatedUh
    }])
    .query((query) => Number.isInteger(+query.id))
    .reply(200, [{ csid, privk, k }])

  nock('https://eu.api.mega.co.nz:443')
    .replyContentLength()
    .post('/cs', [{ a: 'ug' }])
    .query((query) => Number.isInteger(+query.id) && query.sid === encodedSid)
    .reply(200, [{
      u: 'test-user',
      name: 'Test User'
    }])

  // Finally create a new connection using Storage
  const storage = new Storage({
    email: testEmail,
    password: testBuffer(8),
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
