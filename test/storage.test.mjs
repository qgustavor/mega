import megamock from 'mega-mock'
import test from 'ava'
import tmp from 'tmp'

import Storage from '../lib/storage.mjs'
import File from '../lib/file.mjs'

// Set up test server
test.serial.before(t => {
  return new Promise((resolve, reject) => {
    tmp.dir({
      prefix: 'megajs-tests-',
      unsafeCleanup: true
    }, (error, path, cleanupCallback) => {
      if (error) return reject(error)

      const server = megamock({
        dataFolder: path,
        visualize: false
      })

      server.state.loginData.set('jCf2Pc0pLCU', {
        csid: 'CACRPiCIZqylaYVkXvUxvE4XkQeJrwTonOWCikeZFTRPxu5R97xTMTRxNeWlY5keMSLoUACOceI6CHjDLILL-6mQYN37_El9Y5bgmcwJtSHN54au0igwkxxZw_lD7lliQ4uSvSSihQ_iKjj2SxFFmF4F8Sa2UCYQz1iLMDhejR7YAaGGggII5e8jYbtNPOiwwPYf-AFWB7IfOFFXmZ6tLzDJrbodbhAc6EVaiPZZ4QyT6fdKchQeDkjDZu_ygxU0DBQEco1X6SuekGfORsannkJsgAIIlp1Uz-ZdZrrbXoXhFDsCXsibUWJJjF4cPwHMtPSjzcyE_vd-ViFKQJcNDain',
        privk: 'AY5AYTQVUt772M3pLi9v7WNhUSYhvrGOnXuyePr4bOlOlckyomWizvB6xqqHGkx3cYXGWTM3QrAxHPFRNhnd47cG974nkGJyjv7NL6vnIGsmtuiMNpLrrkl9nS8itTZCluBWV7jPc6dRlFWNQ7uiT-Bc6d2mFiApd3xYJuNXFmgFo2_8z_1HQhXWOFJIlsESXc_oaxg0QNx8zE9pCdrKWTCw07VKCbAvJNnYGFdSnEjv3phBUkOd2snyK3LA-Kn9ehPgfcDmSfLaCJ_5y5IN18rHGQdRt_Dxs_CabKYgmF6rKMJ8BCfunuOso6Gx984fOvtbyrwxeL6z0QbqsvGe6H3GpoY6d5M0tnFoJz_PlY0EX5gW6Eo0ZGSJ1xcyMewqQt2JBtw-LuMojrwctHc7KchgLgbqqbJHnuRYrOCjkJeySwOHoUR1lP8qjmHUIlSPaRvughULPIoAs6suoRNBgHq_LEvuAFb9zA05El3Z98eKH6Sxstw_K-d7ZbV_k4osKEwCgDa0Y9vTfpcxt6iw0IqGBqkt6v1U8u4lXaiue_0CVbxhrTH4N5Ceyy7yLsyt8ju6hKRljZ5G9fKcB6rvp3h5WxDnLdJ1KTuZatcZI37uAnEBHNhJJoJE-xNIAWIgcfpffQ-BXlBaejTIyAY_zf0SjRnXIYd3PvBVwRFGKNN7Yp-eEiS3nFTvtBuGv8YK1488UJhj4-jLaQdnFRxB3wFoFdaIPdIJowtZkaYlViZ15cNxd70EK97dgUJm9AUJKQGfIopl0ucEtxNUjXn6ekscILk23LpVNE3kDROCxyIOPTGCPKPo-FZtMTQkZxW3vZ6pxjzmCzTm5Q13XmMtMDrEsgVb9jWC9sEMlHxIMLA',
        k: 'xMEmMmKm0AbbOf9nGPLgSA'
      })

      t.context.server = server
      t.context.cleanup = cleanupCallback

      // Create a Storage instance which will be used by each test
      const storage = new Storage({
        email: 'mock@test',
        password: 'mock',
        autologin: false
      })
      t.context.storage = storage

      server.listen(0, '127.0.0.1', () => {
        // Replace default gateway with mock
        const port = server.address().port
        storage.api.gateway = `http://127.0.0.1:${port}/`
        resolve()
      })
    })
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

test.serial('Should upload streams', t => {
  return new Promise((resolve, reject) => {
    const storage = t.context.storage
    const server = t.context.server

    const uploadStream = storage.upload({
      name: 'test file',
      key: Buffer.alloc(24)
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

test.serial.after(t => {
  return new Promise(resolve => {
    t.context.cleanup()
    t.context.server.close(resolve)
  })
})
