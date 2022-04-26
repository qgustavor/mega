import File, { LABEL_NAMES } from './file.mjs'
import secureRandom from 'secure-random'
import { PassThrough } from 'stream'
import { e64, getCipher, megaEncrypt, formatKey, AES, unmergeKeyMac } from './crypto/index.mjs'
import { detectSize, streamToCb, createPromise } from './util.mjs'

const KEY_CACHE = {}

// metadata can be mutated, not the content
class MutableFile extends File {
  constructor (opt, storage) {
    super(opt)

    this.storage = storage
    this.api = storage.api
    this.nodeId = opt.h
    this.timestamp = opt.ts
    this.type = opt.t
    this.directory = !!this.type

    if (opt.k) {
      const idKeyPairs = opt.k.split('/')
      let aes = storage.aes

      for (const idKeyPair of idKeyPairs) {
        const id = idKeyPair.split(':')[0]
        if (id === storage.user) {
          opt.k = idKeyPair
          break
        }
        const shareKey = storage.shareKeys[id]
        if (shareKey) {
          opt.k = idKeyPair
          aes = KEY_CACHE[id]
          if (!aes) {
            aes = KEY_CACHE[id] = new AES(shareKey)
          }
          break
        }
      }

      this.loadMetadata(aes, opt)
    }
  }

  loadAttributes () {
    throw Error('This is not needed for files loaded from logged in sessions')
  }

  mkdir (opt, originalCb) {
    if (!this.directory) throw Error("node isn't a directory")

    const [cb, promise] = createPromise(originalCb)
    if (typeof opt === 'string') {
      opt = { name: opt }
    }
    if (!opt.attributes) opt.attributes = {}
    if (opt.name) opt.attributes.n = opt.name

    if (!opt.attributes.n) {
      throw Error('file name is required')
    }

    if (!opt.target) opt.target = this
    if (!opt.key) opt.key = Buffer.from(secureRandom(16))

    if (opt.key.length !== 16) {
      throw Error('wrong key length, must be 128bit')
    }

    const key = opt.key
    const at = MutableFile.packAttributes(opt.attributes)

    getCipher(key).encryptCBC(at)

    const storedKey = Buffer.from(key)
    this.storage.aes.encryptECB(storedKey)

    const request = {
      a: 'p',
      t: opt.target.nodeId ? opt.target.nodeId : opt.target,
      n: [{
        h: 'xxxxxxxx',
        t: 1,
        a: e64(at),
        k: e64(storedKey)
      }]
    }

    const shares = getShares(this.storage.shareKeys, this)
    if (shares.length > 0) {
      request.cr = makeCryptoRequest(this.storage, [{
        nodeId: 'xxxxxxxx',
        key
      }], shares)
    }

    this.api.request(request, (err, response) => {
      if (err) return cb(err)
      const file = this.storage._importFile(response.f[0])
      this.storage.emit('add', file)
      cb(null, file)
    })

    return promise
  }

  upload (opt, source, originalCb) {
    if (!this.directory) throw Error('node is not a directory')
    if (arguments.length === 2 && typeof source === 'function') {
      [originalCb, source] = [source, null]
    }
    const [cb, promise] = createPromise(originalCb)

    if (typeof opt === 'string') {
      opt = { name: opt }
    }

    if (!opt.attributes) opt.attributes = {}
    if (opt.name) opt.attributes.n = opt.name

    if (!opt.attributes.n) {
      throw Error('File name is required.')
    }

    if (
      !(typeof opt.size === 'number' && opt.size >= 0) &&
      !(source && typeof source.pipe !== 'function' && typeof source.length === 'number') &&
      !opt.allowUploadBuffering
    ) {
      throw Error('Specify a file size or set allowUploadBuffering to true')
    }

    if (!opt.target) opt.target = this

    let finalKey
    let key = formatKey(opt.key)
    if (!key) key = secureRandom(24)
    if (!(key instanceof Buffer)) key = Buffer.from(key)

    // Ciphertext uploading only works if is `uploadCiphertext` is set to true
    // This is in case some application allowed key to be modified
    // by the users without checking the size
    const keySize = opt.uploadCiphertext ? 32 : 24
    if (key.length !== keySize) {
      throw Error('Wrong key length. Key must be 192bit')
    }

    if (opt.uploadCiphertext) {
      finalKey = key
      key = unmergeKeyMac(key).slice(0, 24)
    }

    opt.key = key

    const hashes = []
    const checkCallbacks = (err, type, hash, encrypter) => {
      if (err) return returnError(err)
      if (!hash || hash.length === 0) {
        returnError(Error('Server returned a invalid response while uploading'))
        return
      }

      const errorCheck = Number(hash.toString())
      if (errorCheck < 0) {
        returnError(Error('Server returned error ' + errorCheck + ' while uploading'))
        return
      }

      hashes[type] = hash
      if (type === 0 && !finalKey) finalKey = encrypter.key

      if (opt.thumbnailImage && !hashes[1]) return
      if (opt.previewImage && !hashes[2]) return
      if (!hashes[0]) return

      const at = MutableFile.packAttributes(opt.attributes)
      getCipher(finalKey).encryptCBC(at)

      const storedKey = Buffer.from(finalKey)
      this.storage.aes.encryptECB(storedKey)

      const fileObject = {
        h: e64(hashes[0]),
        t: 0,
        a: e64(at),
        k: e64(storedKey)
      }

      if (hashes.length !== 1) {
        fileObject.fa = hashes.slice(1).map((hash, index) => {
          return index + '*' + e64(hash)
        }).filter(e => e).join('/')
      }

      const request = {
        a: 'p',
        t: opt.target.nodeId ? opt.target.nodeId : opt.target,
        n: [fileObject]
      }

      const shares = getShares(this.storage.shareKeys, this)
      if (shares.length > 0) {
        request.cr = makeCryptoRequest(this.storage, [{
          nodeId: fileObject.h,
          key: finalKey
        }], shares)
      }

      this.api.request(request, (err, response) => {
        if (err) return returnError(err)
        const file = this.storage._importFile(response.f[0])
        this.storage.emit('add', file)
        stream.emit('complete', file)

        if (cb) cb(null, file)
      })
    }

    if (opt.thumbnailImage) {
      this._uploadAttribute(opt, opt.thumbnailImage, 1, checkCallbacks)
    }
    if (opt.previewImage) {
      this._uploadAttribute(opt, opt.previewImage, 2, checkCallbacks)
    }

    const stream = this._upload(opt, source, 0, checkCallbacks)

    function returnError (e) {
      if (stream.listenerCount('error')) {
        stream.emit('error', e)
      } else {
        cb(e)
      }
    }

    // Since it returns a writable stream the promise is made available via .complete, similar to the complete event
    stream.complete = promise

    return stream
  }

  _upload (opt, source, type, cb) {
    const encrypter = opt.uploadCiphertext
      ? new PassThrough()
      : megaEncrypt(opt.key)

    let stream = encrypter

    // Size is needed before upload. Kills the streaming otherwise.
    let size = opt.size

    // handle buffer
    if (source && typeof source.pipe !== 'function') {
      size = source.length
      stream.end(source)
    }

    if (size != null) {
      if (size === 0) encrypter.end()
      this._uploadWithSize(stream, size, encrypter, type, opt, cb)
    } else {
      stream = detectSize(stream, size => {
        this._uploadWithSize(stream, size, encrypter, type, opt, cb)
      })
    }

    // handle stream
    if (source && typeof source.pipe === 'function') {
      source.pipe(stream)
    }

    return stream
  }

  _uploadAttribute (opt, source, type, cb) {
    const gotBuffer = (err, buffer) => {
      if (err) return cb(err)

      const len = buffer.length
      const rest = Math.ceil(len / 16) * 16 - len

      if (rest !== 0) {
        buffer = Buffer.concat([buffer, Buffer.alloc(rest)])
      }

      const encrypter = opt.handle
        ? getCipher(opt.key)
        : new AES(opt.key.slice(0, 16))
      encrypter.encryptCBC(buffer)

      const stream = new PassThrough()
      stream.end(buffer)

      this._uploadWithSize(stream, buffer.length, stream, type, opt, cb)
    }

    // handle buffer
    if (source instanceof Buffer) {
      gotBuffer(null, source)
      return
    }

    streamToCb(source, gotBuffer)
  }

  _uploadWithSize (stream, size, source, type, opt, cb) {
    const ssl = (opt.forceHttps ?? process.env.IS_BROWSER_BUILD) ? 2 : 0
    const getUrlRequest = type === 0
      ? { a: 'u', ssl, s: size, ms: 0, r: 0, e: 0, v: 2 }
      : { a: 'ufa', ssl, s: size }

    if (opt.handle) {
      getUrlRequest.h = opt.handle
    }

    const initialChunkSize = type === 0 ? (opt.initialChunkSize || 128 * 1024) : size
    const chunkSizeIncrement = opt.chunkSizeIncrement || 128 * 1024
    const maxChunkSize = opt.maxChunkSize || 1024 * 1024
    const maxConnections = opt.maxConnections || 4
    const handleRetries = opt.handleRetries || File.defaultHandleRetries

    let currentChunkSize = initialChunkSize
    let activeConnections = 0
    let isReading = false
    let position = 0
    let remainingBuffer
    let uploadBuffer, uploadURL
    let chunkSize, chunkPos

    const handleChunk = () => {
      chunkSize = Math.min(currentChunkSize, size - position)
      uploadBuffer = Buffer.alloc(chunkSize)
      activeConnections++

      if (currentChunkSize < maxChunkSize) {
        currentChunkSize += chunkSizeIncrement
      }

      chunkPos = 0
      if (remainingBuffer) {
        remainingBuffer.copy(uploadBuffer)
        chunkPos = Math.min(remainingBuffer.length, chunkSize)
        remainingBuffer = remainingBuffer.length > chunkSize
          ? remainingBuffer.slice(chunkSize)
          : null
      }

      // It happens when the remaining buffer contains the entire chunk
      if (chunkPos === chunkSize) {
        sendChunk()
      } else {
        isReading = true
        handleData()
      }
    }

    const sendChunk = () => {
      const chunkPosition = position
      const chunkBuffer = uploadBuffer
      let tries = 0

      const trySendChunk = () => {
        tries++
        this.api.fetch(uploadURL + '/' + (type === 0 ? chunkPosition : (type - 1)), {
          method: 'POST',
          body: chunkBuffer,
          headers: {
            'content-length': chunkBuffer.length
          }
        }).then(response => {
          if (response.status !== 200) {
            throw Error('MEGA returned a ' + response.status + ' status code')
          }
          return response.arrayBuffer()
        }).then(hash => {
          const hashBuffer = Buffer.from(hash)
          if (hashBuffer.length > 0) {
            source.end()
            process.nextTick(() => {
              cb(null, type, hashBuffer, source)
            })
          } else if (position < size && !isReading) {
            handleChunk()
          }
        }, error => {
          handleRetries(tries, error, error => {
            if (error) {
              stream.emit('error', error)
            } else {
              trySendChunk()
            }
          })
        })
      }
      trySendChunk()

      uploadBuffer = null
      position += chunkSize

      if (position < size && !isReading && activeConnections < maxConnections) {
        handleChunk()
      }
    }

    let sizeCheck = 0
    const handleData = () => {
      while (true) {
        const data = source.read()
        if (data === null) {
          source.once('readable', handleData)
          break
        }
        sizeCheck += data.length
        stream.emit('progress', { bytesLoaded: sizeCheck, bytesTotal: size })

        data.copy(uploadBuffer, chunkPos)
        chunkPos += data.length

        if (chunkPos >= chunkSize) {
          isReading = false

          remainingBuffer = data.slice(data.length - (chunkPos - chunkSize))
          sendChunk()
          break
        }
      }
    }

    source.on('end', () => {
      if (size && sizeCheck !== size) {
        stream.emit('error', Error('Specified data size does not match: ' + size + ' !== ' + sizeCheck))
      }
    })

    this.api.request(getUrlRequest, (err, resp) => {
      if (err) return cb(err)
      uploadURL = resp.p
      handleChunk()
    })
  }

  uploadAttribute (type, data, originalCb) {
    const [cb, promise] = createPromise(originalCb)

    if (typeof type === 'string') {
      type = ['thumbnail', 'preview'].indexOf(type)
    }
    if (type !== 0 && type !== 1) throw Error('Invalid attribute type')

    this._uploadAttribute({
      key: this.key,
      handle: this.nodeId
    }, data, type + 1, (err, streamType, hash, encrypter) => {
      if (err) return cb(err)
      const request = {
        a: 'pfa',
        n: this.nodeId,
        fa: type + '*' + e64(hash)
      }

      this.api.request(request, (err, response) => {
        if (err) return cb(err)
        cb(null, this)
      })
    })

    return promise
  }

  delete (permanent, cb) {
    if (typeof permanent === 'function') {
      cb = permanent
      permanent = undefined
    }

    if (typeof permanent === 'undefined') {
      permanent = this.parent === this.storage.trash
    }

    if (permanent) return this.api.request({ a: 'd', n: this.nodeId }, cb)
    return this.moveTo(this.storage.trash, cb)
  }

  moveTo (target, cb) {
    if (typeof target === 'string') {
      target = this.storage.files[target]
    }

    if (!(target instanceof File)) {
      throw Error('target must be a folder or a nodeId')
    }

    const request = { a: 'm', n: this.nodeId, t: target.nodeId }
    const shares = getShares(this.storage.shareKeys, target)
    if (shares.length > 0) {
      request.cr = makeCryptoRequest(this.storage, [this], shares)
    }

    return this.api.request(request, cb)
  }

  setAttributes (attributes, originalCb) {
    const [cb, promise] = createPromise(originalCb)
    Object.assign(this.attributes, attributes)

    const newAttributes = MutableFile.packAttributes(this.attributes)
    getCipher(this.key).encryptCBC(newAttributes)

    this.api.request({ a: 'a', n: this.nodeId, at: e64(newAttributes) }, (error) => {
      this.parseAttributes(this.attributes)
      cb(error)
    })

    return promise
  }

  rename (filename, cb) {
    return this.setAttributes({
      n: filename
    }, cb)
  }

  setLabel (label, cb) {
    if (typeof label === 'string') label = LABEL_NAMES.indexOf(label)
    if (typeof label !== 'number' || Math.floor(label) !== label || label < 0 || label > 7) {
      throw Error('label must be a integer between 0 and 7 or a valid label name')
    }

    return this.setAttributes({
      lbl: label
    }, cb)
  }

  setFavorite (isFavorite, cb) {
    return this.setAttributes({
      fav: isFavorite ? 1 : 0
    }, cb)
  }

  link (options, originalCb) {
    if (arguments.length === 1 && typeof options === 'function') {
      originalCb = options
      options = {
        noKey: false
      }
    }

    if (typeof options === 'boolean') {
      options = {
        noKey: options
      }
    }

    // __folderKey is used internally, don't use this
    const folderKey = options.__folderKey
    if (this.directory && !folderKey) {
      return this.shareFolder(options, originalCb)
    }

    const [cb, promise] = createPromise(originalCb)
    this.api.request({ a: 'l', n: this.nodeId }, (err, id) => {
      if (err) return cb(err)

      let url = `https://mega.nz/${folderKey ? 'folder' : 'file'}/${id}`
      if (!options.noKey && this.key) url += `#${e64(folderKey || this.key)}`

      cb(null, url)
    })

    return promise
  }

  shareFolder (options, originalCb) {
    if (!this.directory) throw Error("node isn't a folder")

    const handler = this.nodeId
    const storedShareKey = this.storage.shareKeys[handler]
    if (storedShareKey) {
      return this.link(Object.assign({
        __folderKey: storedShareKey
      }, options), originalCb)
    }

    let shareKey = formatKey(options.key)

    if (!shareKey) {
      shareKey = secureRandom(16)
    }

    if (!(shareKey instanceof Buffer)) {
      shareKey = Buffer.from(shareKey)
    }

    const [cb, promise] = createPromise(originalCb)
    if (shareKey.length !== 16) {
      cb(Error('share key must be 16 byte / 22 characters'))
      return promise
    }

    this.storage.shareKeys[handler] = shareKey

    const authKey = Buffer.from(handler + handler)
    this.storage.aes.encryptECB(authKey)

    const request = {
      a: 's2',
      n: handler,
      s: [{ u: 'EXP', r: 0 }],
      ok: e64(this.storage.aes.encryptECB(Buffer.from(shareKey))),
      ha: e64(authKey),
      cr: makeCryptoRequest(this.storage, this)
    }

    this.api.request(request, (err) => {
      if (err) return cb(err)
      this.link(Object.assign({
        __folderKey: shareKey
      }, options), cb)
    })

    return promise
  }

  unshare (cb) {
    if (this.directory) return this.unshareFolder(cb)

    return this.api.request({
      a: 'l',
      n: this.nodeId,
      d: 1
    }, cb)
  }

  unshareFolder (cb) {
    if (!this.directory) throw Error("node isn't a folder")
    delete this.storage.shareKeys[this.nodeId]

    return this.api.request({
      a: 's2',
      n: this.nodeId,
      s: [{ u: 'EXP', r: '' }]
    }, cb)
  }

  importFile (sharedFile, originalCb) {
    const [cb, promise] = createPromise(originalCb)

    if (!this.directory) throw Error('importFile can only be called on directories')
    if (typeof sharedFile === 'string') sharedFile = File.fromURL(sharedFile)
    if (!(sharedFile instanceof File)) throw Error('First argument of importFile should be a File or a URL string')

    if (!sharedFile.key) {
      cb(Error("Can't import files without encryption keys"))
      return promise
    }

    // We need file attributes
    const afterGotAttributes = (err, file) => {
      if (err) return cb(err)

      const attributes = MutableFile.packAttributes(file.attributes)
      getCipher(file.key).encryptCBC(attributes)

      const downloadId = Array.isArray(file.downloadId)
        ? file.downloadId[1]
        : file.downloadId

      const request = {
        a: 'p',
        t: this.nodeId,
        n: [{
          ph: downloadId,
          t: 0,
          a: e64(attributes),
          k: e64(this.storage.aes.encryptECB(file.key))
        }]
      }

      this.api.request(request, (err, response) => {
        if (err) return cb(err)

        const file = this.storage._importFile(response.f[0])
        this.storage.emit('add', file)

        cb(null, file)
      })
    }

    // Check if attributes were already downloaded
    if (sharedFile.attributes) {
      afterGotAttributes(null, sharedFile)
    } else {
      sharedFile.loadAttributes(afterGotAttributes)
    }

    return promise
  }

  static packAttributes (attributes) {
    let at = JSON.stringify(attributes)
    at = Buffer.from(`MEGA${at}`)
    const ret = Buffer.alloc(Math.ceil(at.length / 16) * 16)
    at.copy(ret)
    return ret
  }
}

// source: https://github.com/meganz/webclient/blob/918222d5e4521c8777b1c8da528f79e0110c1798/js/crypto.js#L3728
// generate crypto request response for the given nodes/shares matrix
function makeCryptoRequest (storage, sources, shares) {
  const shareKeys = storage.shareKeys

  if (!Array.isArray(sources)) {
    sources = selfAndChildren(sources)
  }

  if (!shares) {
    shares = sources
      .map(source => getShares(shareKeys, source))
      .reduce((arr, el) => arr.concat(el))
      .filter((el, index, arr) => index === arr.indexOf(el))
  }

  const cryptoRequest = [
    shares,
    sources.map(node => node.nodeId),
    []
  ]

  for (let i = shares.length; i--;) {
    const aes = new AES(shareKeys[shares[i]])

    for (let j = sources.length; j--;) {
      const fileKey = Buffer.from(sources[j].key)

      if (fileKey && (fileKey.length === 32 || fileKey.length === 16)) {
        cryptoRequest[2].push(i, j, e64(aes.encryptECB(fileKey)))
      }
    }
  }

  return cryptoRequest
}

function selfAndChildren (node) {
  return [node]
    .concat((node.children || [])
      .map(selfAndChildren)
      .reduce((arr, el) => arr.concat(el), []))
}

function getShares (shareKeys, node) {
  const handle = node.nodeId
  const parent = node.parent
  const shares = []

  if (shareKeys[handle]) {
    shares.push(handle)
  }

  return parent
    ? shares.concat(getShares(shareKeys, parent))
    : shares
}

export default MutableFile
