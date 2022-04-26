/* global Deno */

import test from 'ava'
import { testBuffer, sha1 } from './helpers/test-utils.mjs'
import { Storage, File } from '../dist/main.node-es.mjs'

// Set up Storage to use test server and credentials
const gatewayUrl = typeof Deno !== 'undefined'
  ? Deno.env.get('MEGA_MOCK_URL')
  : process.env.MEGA_MOCK_URL
if (!gatewayUrl) throw Error('Missing MEGA_MOCK_URL environment variable')

const storage = new Storage({
  email: 'mock@test',
  password: 'mock',
  autologin: false,
  gateway: gatewayUrl
})

test.serial('Should login to MEGA', t => {
  return new Promise((resolve, reject) => {
    storage.login((error, result) => {
      if (error) return reject(error)

      t.is(result, storage)
      t.is(storage.name, 'Test User')
      t.is(storage.user, 'jCf2Pc0pLCU')

      resolve()
    })
  })
}, {
  sanitizeResources: false,
  sanitizeOps: false
})

test.serial('Should upload buffers', t => {
  return new Promise((resolve, reject) => {
    storage.upload({
      name: 'test file buffer',
      key: Buffer.alloc(24)
    }, Buffer.alloc(16), (error, file) => {
      if (error) return reject(error)

      t.is(file.name, 'test file buffer')
      resolve()
    })
  })
})

test.serial('Should not allow uploading without a size', t => {
  t.throws(() => {
    storage.upload({ name: 'skipped file' })
  }, {
    message: 'Specify a file size or set allowUploadBuffering to true'
  })
})

test.serial('Should stream upload', async t => {
  const dataSize = 2 * 1024 * 1024
  const uploadedData = testBuffer(dataSize)
  const uploadStream = storage.upload({
    name: 'test file streams',
    key: Buffer.alloc(24),
    size: dataSize
  })
  uploadStream.end(Buffer.from(uploadedData))

  const file = await uploadStream.complete
  t.is(file.name, 'test file streams')
  t.is(file.key.toString('hex'), '0000000000000000831f1ab870f945580000000000000000831f1ab870f94558')
  t.is(file.size, dataSize)
})

test.serial('Should stream download', async t => {
  const file = storage.root.children.find(e => e.name === 'test file streams')
  const uploadedData = testBuffer(file.size)
  const uploadedHash = sha1(uploadedData)
  const singleConnData = await file.downloadBuffer({
    maxConnections: 1
  })
  t.is(singleConnData.length, file.size)
  t.is(sha1(singleConnData), uploadedHash)

  const multiConnData = await file.downloadBuffer()
  t.is(multiConnData.length, file.size)
  t.is(sha1(singleConnData), uploadedHash)
})

test.serial('Should share files', t => {
  return new Promise((resolve, reject) => {
    const file = storage.root.children.find(e => e.name === 'test file buffer')

    file.link((error, link) => {
      if (error) return reject(error)
      t.is(link, 'https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
      resolve()
    })
  })
})

test.serial('Should download shared files (old format)', t => {
  return new Promise((resolve, reject) => {
    const file = File.fromURL('https://mega.nz/#!AAAAAAAE!AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
    file.api = storage.api

    file.loadAttributes((error, loadedFile) => {
      if (error) return reject(error)
      t.is(file, loadedFile)

      t.is(file.size, 16)
      t.is(file.directory, false)
      t.is(file.name, 'test file buffer')
      t.deepEqual(file.attributes, { n: 'test file buffer' })

      file.download((error, data) => {
        if (error) return reject(error)
        t.is(data.toString('hex'), Buffer.alloc(16).toString('hex'))
        resolve()
      })
    })
  })
})

test.serial('Should download shared files (new format)', t => {
  return new Promise((resolve, reject) => {
    const file = File.fromURL('https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
    file.api = storage.api

    file.loadAttributes((error, loadedFile) => {
      if (error) throw error
      t.is(file, loadedFile)

      t.is(file.size, 16)
      t.is(file.directory, false)
      t.is(file.name, 'test file buffer')
      t.deepEqual(file.attributes, { n: 'test file buffer' })

      file.download((error, data) => {
        if (error) return reject(error)
        t.is(data.toString('hex'), Buffer.alloc(16).toString('hex'))
        resolve()
      })
    })
  })
})

test.serial('Should download shared files using promises', async t => {
  const file = File.fromURL('https://mega.nz/#!AAAAAAAE!AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
  file.api = storage.api

  const loadedFile = await file.loadAttributes()
  t.is(file, loadedFile)

  t.is(file.size, 16)
  t.is(file.directory, false)
  t.is(file.name, 'test file buffer')
  t.deepEqual(file.attributes, { n: 'test file buffer' })

  const data = await file.downloadBuffer()
  t.is(data.toString('hex'), Buffer.alloc(16).toString('hex'))
})

test.serial('Should create folders', t => {
  return new Promise((resolve, reject) => {
    storage.mkdir({
      name: 'test folder',
      key: Buffer.alloc(16)
    }, (error, folder) => {
      if (error) return reject(error)

      t.is(folder.name, 'test folder')
      resolve()
    })
  })
})

test.serial('Should share folders', t => {
  return new Promise((resolve, reject) => {
    const folder = storage.root.children.find(e => e.name === 'test folder')

    folder.link({
      key: Buffer.alloc(16)
    }, (error, link) => {
      if (error) return reject(error)
      t.is(link, 'https://mega.nz/folder/AAAAAAAG#AAAAAAAAAAAAAAAAAAAAAA')
      resolve()
    })
  })
})

test.serial('Should create folders in shared folders', t => {
  return new Promise((resolve, reject) => {
    const parent = storage.root.children.find(e => e.name === 'test folder')

    parent.mkdir({
      name: 'test folder 2',
      key: Buffer.alloc(16)
    }, (error, folder) => {
      if (error) return reject(error)

      t.is(folder.name, 'test folder 2')
      t.is(folder.parent, parent)
      resolve()
    })
  })
})

// See issue #45
test.serial('Should upload files in folders in shared folders', t => {
  return new Promise((resolve, reject) => {
    const folder = storage.root
      .children.find(e => e.name === 'test folder')
      .children.find(e => e.name === 'test folder 2')

    folder.upload({
      name: 'file in folder 2',
      key: Buffer.alloc(24)
    }, Buffer.alloc(16), (error, file) => {
      if (error) return reject(error)

      t.is(file.name, 'file in folder 2')
      t.is(file.parent, folder)
      resolve()
    })
  })
})

// TODO implement test for download files shared in folders
// Depends on fixing mega-mock shared file key handling

// https://github.com/qgustavor/mega/issues/83
test.serial('Should upload empty files', t => {
  return new Promise((resolve, reject) => {
    storage.upload({
      name: 'empty file',
      key: Buffer.alloc(24)
    }, Buffer.alloc(0), (error, file) => {
      if (error) return reject(error)

      t.is(file.name, 'empty file')
      resolve()
    })
  })
})

test.serial('Should download empty files', t => {
  return new Promise((resolve, reject) => {
    const file = storage.root.children.find(e => e.name === 'empty file')

    file.download((error, data) => {
      if (error) return reject(error)
      t.is(data.length, 0)
      resolve()
    })
  })
})

test.serial('Should create folders using promises', async t => {
  const folder = await storage.mkdir({
    name: 'test folder promise',
    key: Buffer.alloc(16)
  })

  t.is(folder.name, 'test folder promise')
})

test.serial('Should upload files using promises', async t => {
  const file = await storage.upload({
    name: 'test file buffer promise',
    key: Buffer.alloc(24)
  }, Buffer.alloc(16)).complete

  t.is(file.name, 'test file buffer promise')
})

test.serial('Should login using promises', async t => {
  const promiseResolvedValue = await storage.ready
  t.is(promiseResolvedValue, storage)
})

test.serial('Should share folders using promises', async t => {
  const folder = storage.root.children.find(e => e.name === 'test folder')

  const link = await folder.link({
    key: Buffer.alloc(16)
  })
  t.is(link, 'https://mega.nz/folder/AAAAAAAG#AAAAAAAAAAAAAAAAAAAAAA')
})

test.serial('Should share folders without keys', async t => {
  const folder = storage.root.children.find(e => e.name === 'test folder')

  const link = await folder.link({
    key: Buffer.alloc(16),
    noKey: true
  })
  t.is(link, 'https://mega.nz/folder/AAAAAAAG')
})

// Zalgo = https://oren.github.io/articles/zalgo/
test.serial('Should not release zalgo when using callbacks', t => {
  let released = false
  // eslint-disable-next-line no-new
  new Storage({
    email: 'mock@test',
    password: 'mock',
    autologin: false
  }, () => {
    released = true
  })
  t.is(released, false)
})

test.serial('Should not release zalgo when using promises', t => {
  let released = false
  // eslint-disable-next-line no-new
  new Storage({
    email: 'mock@test',
    password: 'mock',
    autologin: false
  }).ready.then(() => {
    released = true
  })
  t.is(released, false)
})

test.serial('Should share folders using shareFolder (callback)', t => {
  return new Promise((resolve, reject) => {
    const folder = storage.root.children.find(e => e.name === 'test folder')

    folder.shareFolder({
      key: Buffer.alloc(16),
      noKey: true
    }, (error, link) => {
      if (error) return reject(link)
      t.is(link, 'https://mega.nz/folder/AAAAAAAG')
      resolve()
    })
  })
})

test.serial('Should share folders using shareFolder (promise)', async t => {
  const folder = storage.root.children.find(e => e.name === 'test folder')

  const link = await folder.shareFolder({
    key: Buffer.alloc(16),
    noKey: true
  })
  t.is(link, 'https://mega.nz/folder/AAAAAAAG')
})

test.serial('Should not release zalgo when using shareFolder', async t => {
  return new Promise((resolve, reject) => {
    const folder = storage.root.children.find(e => e.name === 'test folder promise')

    let zalgoReleased = true
    folder.shareFolder({
      key: Buffer.alloc(32)
    }, (error, link) => {
      if (!error) return reject(Error('Should fail'))
      t.is(error.message, 'share key must be 16 byte / 22 characters')
      t.is(zalgoReleased, false)
      resolve()
    })
    zalgoReleased = false
  })
})

let uploadedSha
test.serial('Should upload huge files in parts', async t => {
  const parts = 16
  const partSize = 128 * 1024
  const fullSize = parts * partSize
  const uploadedData = Buffer.alloc(fullSize)
  const uploadStream = storage.upload({
    name: 'test file streams 2',
    key: Buffer.alloc(24),
    size: fullSize
  })

  for (let i = 0; i < parts; i++) {
    const data = testBuffer(partSize)
    data.copy(uploadedData, partSize * i)
    uploadStream.write(data)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  uploadStream.end()

  const file = await uploadStream.complete
  t.is(file.name, 'test file streams 2')
  t.is(file.size, fullSize)
  uploadedSha = sha1(uploadedData)
})

test.serial('Should download files uploaded in parts', async t => {
  const file = storage.root.children.find(e => e.name === 'test file streams 2')
  const downloadedData = await file.downloadBuffer()
  t.is(downloadedData.length, file.size)
  t.is(sha1(downloadedData), uploadedSha)
})

// Issue #101
test.serial('Should allowUploadBuffering ', async t => {
  const dataSize = 2 * 1024 * 1024
  const uploadedData = testBuffer(dataSize)
  const uploadStream = storage.upload({
    name: 'test file streams',
    key: Buffer.alloc(24),
    allowUploadBuffering: true
  })
  uploadStream.end(Buffer.from(uploadedData))

  const file = await uploadStream.complete
  t.is(file.name, 'test file streams')
  t.is(file.key.toString('hex'), '0000000000000000831f1ab870f945580000000000000000831f1ab870f94558')
  t.is(file.size, dataSize)
})

test.serial('Should logout from MEGA', t => {
  return new Promise((resolve, reject) => {
    storage.close((error) => {
      if (error) return reject(error)

      t.is(storage.status, 'closed')
      resolve()
    })
  })
})
