import test from 'ava'
import { Storage, File } from '../dist/main.node-es.mjs'

// Set up test server
test.serial.before(t => {
  const gatewayUrl = typeof Deno !== 'undefined'
    ? Deno.env.get('MEGA_MOCK_URL')
    : typeof process !== 'undefined'
      ? process.env.MEGA_MOCK_URL
      : null
  if (!gatewayUrl) throw Error('Missing MEGA_MOCK_URL environment variable')

  t.context.storage = new Storage({
    email: 'mock@test',
    password: 'mock',
    autologin: false,
    gateway: gatewayUrl
  })
})

test.serial('Should login to MEGA', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
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
    const storage = t.context.storage
    const server = t.context.server

    storage.upload({
      name: 'test file',
      key: Buffer.alloc(24)
    }, Buffer.alloc(16), (error, file) => {
      if (error) return reject(error)

      const userFiles = server.state.users.get('jCf2Pc0pLCU').files
      t.is(userFiles.length, 1)
      t.is(userFiles[0].h, file.nodeId)

      // This is the handler of the storage root in the mock server implementation
      t.is(userFiles[0].p, 'handler2')

      // As the key is fixed so is the uploaded attribute
      t.is(userFiles[0].a, 'FLGDXkSOt1w9Xg46shAgJpz3_n2dCMVDQm4PoIgizCs')
      t.is(userFiles[0].k, 'FjV5rwRHjdUOmDi5kX93XhY1ea8ER43VDpg4uZF_d14')

      resolve()
    })
  })
})

test.serial('Should not allow uploading without a size', t => {
  const storage = t.context.storage

  t.throws(() => {
    storage.upload({ name: 'test file' })
  }, {
    message: 'Specify a file size or set allowUploadBuffering to true'
  })
})

test.serial('Should upload streams', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    const uploadStream = storage.upload({
      name: 'test file',
      key: Buffer.alloc(24),
      size: 1024 * 1024
    })

    uploadStream.on('error', t.fail)
    uploadStream.on('complete', file => {
      const userFiles = server.state.users.get('jCf2Pc0pLCU').files
      t.is(userFiles.length, 2)
      t.is(userFiles[1].h, file.nodeId)
      t.is(userFiles[1].p, 'handler2')
      t.is(userFiles[1].a, 'FLGDXkSOt1w9Xg46shAgJpz3_n2dCMVDQm4PoIgizCs')
      t.is(userFiles[1].k, '1m-R5ICCi0KRsC_IO_rsatZvkeSAgotCkbAvyDv67Go')

      resolve()
    })

    uploadStream.end(Buffer.alloc(1024 * 1024))
  })
})

test.serial('Should share files', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    const userFiles = server.state.users.get('jCf2Pc0pLCU').files
    const file = storage.files[userFiles[0].h]

    file.link((error, link) => {
      if (error) return reject(error)
      t.is(link, 'https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
      resolve()
    })
  })
})

test.serial('Should download shared files (old format)', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage

    const file = File.fromURL('https://mega.nz/#!AAAAAAAE!AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
    file.api = storage.api

    file.loadAttributes((error, loadedFile) => {
      if (error) return reject(error)
      t.is(file, loadedFile)

      t.is(file.size, 16)
      t.is(file.directory, false)
      t.is(file.name, 'test file')
      t.deepEqual(file.attributes, { n: 'test file' })

      file.download((error, data) => {
        if (error) return reject(error)
        t.deepEqual(data, Buffer.alloc(16))
        resolve()
      })
    })
  })
})

test.serial('Should download shared files (new format)', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage

    const file = File.fromURL('https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY')
    file.api = storage.api

    file.loadAttributes((error, loadedFile) => {
      if (error) throw error
      t.is(file, loadedFile)

      t.is(file.size, 16)
      t.is(file.directory, false)
      t.is(file.name, 'test file')
      t.deepEqual(file.attributes, { n: 'test file' })

      file.download((error, data) => {
        if (error) return reject(error)
        t.deepEqual(data, Buffer.alloc(16))
        resolve()
      })
    })
  })
})

test.serial('Should create folders', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    storage.mkdir({
      name: 'test folder 1',
      key: Buffer.alloc(16)
    }, (error, folder) => {
      if (error) return reject(error)

      const userFiles = server.state.users.get('jCf2Pc0pLCU').files
      t.is(userFiles.length, 3)
      t.is(userFiles[2].h, folder.nodeId)
      t.is(userFiles[2].p, 'handler2')
      t.is(userFiles[2].a, 'FLGDXkSOt1w9Xg46shAgJi6dazxORZOSu6Tjbu3RcIU')
      t.is(userFiles[2].k, 'MPFJW7WnKQxOAyhiHAOWgA')
      resolve()
    })
  })
})

test.serial('Should share folders', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    const userFiles = server.state.users.get('jCf2Pc0pLCU').files

    storage.files[userFiles[2].h].link({
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
    const storage = t.context.storage
    const server = t.context.server

    const userFiles = server.state.users.get('jCf2Pc0pLCU').files

    storage.files[userFiles[2].h].mkdir({
      name: 'test folder 2',
      key: Buffer.alloc(16)
    }, (error, folder) => {
      if (error) return reject(error)

      const userFiles = server.state.users.get('jCf2Pc0pLCU').files
      t.is(userFiles.length, 4)
      t.is(userFiles[3].h, folder.nodeId)
      t.is(userFiles[3].p, userFiles[2].h)
      t.is(userFiles[3].a, 'FLGDXkSOt1w9Xg46shAgJhYO0ahp-pTkfjVlEBMNYk8')
      t.is(userFiles[3].k, 'MPFJW7WnKQxOAyhiHAOWgA')
      resolve()
    })
  })
})

// See issue #45
test.serial('Should upload files in folders in shared folders', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    const userFiles = server.state.users.get('jCf2Pc0pLCU').files

    storage.files[userFiles[3].h].upload({
      name: 'test file',
      key: Buffer.alloc(24)
    }, Buffer.alloc(16), (error, file) => {
      if (error) return reject(error)

      const userFiles = server.state.users.get('jCf2Pc0pLCU').files
      t.is(userFiles.length, 5)
      t.is(userFiles[4].h, file.nodeId)
      t.is(userFiles[4].p, userFiles[3].h)
      t.is(userFiles[4].a, 'FLGDXkSOt1w9Xg46shAgJpz3_n2dCMVDQm4PoIgizCs')
      t.is(userFiles[4].k, 'FjV5rwRHjdUOmDi5kX93XhY1ea8ER43VDpg4uZF_d14')

      resolve()
    })
  })
})

// Skipped as mega-mock doesn't handle keys properly when sharing yet
test.serial.skip('Should download files shared in folders', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage

    const folder = File.fromURL('https://mega.nz/#F!AAAAAAAG!AAAAAAAAAAAAAAAAAAAAAA')
    folder.api.gateway = storage.api.gateway

    folder.loadAttributes((error, loadedFile) => {
      if (error) return reject(error)
      t.is(folder, loadedFile)

      t.falsy(folder.size)
      t.is(folder.directory, true)
      t.is(folder.name, 'test folder 1')
      t.deepEqual(folder.attributes, { n: 'test folder 1' })
      t.truthy(folder.children)
      t.is(folder.children.length, 1)

      let children = folder.children[0]
      t.falsy(children.size)
      t.is(children.directory, true)
      t.is(children.name, 'test folder 2')
      t.deepEqual(children.attributes, { n: 'test folder 2' })
      t.truthy(children.children)
      t.is(children.children.length, 1)

      children = folder.children[0]
      t.is(children.size, 16)
      t.is(children.directory, false)
      t.is(children.name, 'test file')
      t.deepEqual(children.attributes, { n: 'test file' })

      children.download((error, data) => {
        if (error) return reject(error)
        t.deepEqual(data, Buffer.alloc(16))
        resolve()
      })
    })
  })
})
