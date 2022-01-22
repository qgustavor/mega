/* global Deno */

import test from 'ava'
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

test.serial('Should upload streams', t => {
  return new Promise((resolve, reject) => {
    const uploadStream = storage.upload({
      name: 'test file streams',
      key: Buffer.alloc(24),
      size: 1024 * 1024
    })

    uploadStream.on('error', reject)
    uploadStream.on('complete', file => {
      t.is(file.name, 'test file streams')
      resolve()
    })

    uploadStream.end(Buffer.alloc(1024 * 1024))
  })
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

test.serial('Should logout from MEGA', t => {
  return new Promise((resolve, reject) => {
    storage.close((error) => {
      if (error) return reject(error)

      t.is(storage.status, 'closed')
      resolve()
    })
  })
})
