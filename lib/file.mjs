import { e64, d64, AES, formatKey, getCipher, megaDecrypt } from './crypto/index.mjs'
import API from './api.mjs'
import { EventEmitter } from 'events'
import { streamToCb, createPromise } from './util.mjs'
import { PassThrough } from 'stream'
import StreamSkip from 'stream-skip'

class File extends EventEmitter {
  constructor (opt) {
    super()
    this.checkConstructorArgument(opt.downloadId)
    this.checkConstructorArgument(opt.key)
    this.checkConstructorArgument(opt.loadedFile)

    this.downloadId = opt.downloadId
    this.key = opt.key ? formatKey(opt.key) : null
    this.type = opt.directory ? 1 : 0
    this.directory = !!opt.directory
    if (this.directory && !this.children) this.children = []

    // Accept an API object
    this.api = opt.api || API.getGlobalApi()
    if (!(this.api instanceof API)) {
      throw Error('api must be a instance of API')
    }

    this.loadedFile = opt.loadedFile
  }

  get createdAt () {
    if (typeof this.timestamp !== 'undefined') {
      return this.timestamp * 1000
    }
  }

  checkConstructorArgument (value) {
    // If a string was passed then check if it's not empty and
    // contains only base64 valid characters
    if (typeof value === 'string' && !/^[\w-]+$/.test(value)) {
      throw Error(`Invalid argument: "${value}"`)
    }
  }

  loadMetadata (aes, opt) {
    this.size = opt.s || 0
    this.timestamp = opt.ts || 0
    this.type = opt.t
    this.directory = !!opt.t
    this.owner = opt.u
    this.name = null
    if (this.directory && !this.children) this.children = []

    if (!aes || !opt.k) return

    const parts = opt.k.split(':')
    this.key = formatKey(parts[parts.length - 1])

    if (this.key.length <= 32) {
      // Regular AES-ECB encrypted key
      aes.decryptECB(this.key)
    } else if (this.storage) {
      // RSA encrypted key
      this.key = this.storage.decryptRsaKey(this.key).slice(0, this.directory ? 16 : 32)
    } else {
      // Can't decrypt a RSA key without a storage
      this.key = null
    }

    if (opt.a) {
      this.decryptAttributes(opt.a)
    }
  }

  decryptAttributes (at) {
    if (!this.key) return this
    at = d64(at)
    getCipher(this.key).decryptCBC(at)

    const unpackedAttribtes = File.unpackAttributes(at)
    if (unpackedAttribtes) {
      this.parseAttributes(unpackedAttribtes)
    }
  }

  parseAttributes (at) {
    this.attributes = at
    this.name = at.n
    this.label = LABEL_NAMES[at.lbl || 0]
    this.favorited = !!at.fav
  }

  loadAttributes (originalCb) {
    const [cb, promise] = createPromise(originalCb)

    // todo: nodeId version ('n')
    const req = this.directory
      ? {
          a: 'f',
          c: 1,
          ca: 1,
          r: 1,
          _querystring: {
            n: this.downloadId
          }
        }
      : {
          a: 'g',
          p: this.downloadId
        }

    this.api.request(req, (err, response) => {
      if (err) return cb(err)

      if (this.directory) {
        const filesMap = Object.create(null)
        const nodes = response.f
        const folder = nodes.find(node => node.k &&
          // the root folder is the one which "n" equals the first part of "k"
          node.h === node.k.split(':')[0]
        )
        const aes = this.key ? new AES(this.key) : null
        this.nodeId = folder.h
        this.timestamp = folder.ts
        filesMap[folder.h] = this

        for (const file of nodes) {
          if (file === folder) continue
          const fileObj = new File(file, this.storage)
          fileObj.loadMetadata(aes, file)

          // is it the best way to handle this?
          fileObj.downloadId = [this.downloadId, file.h]
          filesMap[file.h] = fileObj
        }

        for (const file of nodes) {
          const parent = filesMap[file.p]
          if (parent) {
            const fileObj = filesMap[file.h]
            parent.children.push(fileObj)
            fileObj.parent = parent
          }
        }

        this.loadMetadata(aes, folder)
        if (this.key && !this.attributes) {
          return cb(Error('Attributes could not be decrypted with provided key.'))
        }

        if (this.loadedFile) {
          const loadedNode = filesMap[this.loadedFile]
          if (typeof loadedNode === 'undefined') {
            cb(Error('Node (file or folder) not found in folder'))
          } else {
            cb(null, loadedNode)
          }
        } else {
          cb(null, this)
        }
      } else {
        this.size = response.s
        this.decryptAttributes(response.at)

        if (this.key && !this.attributes) {
          return cb(Error('Attributes could not be decrypted with provided key.'))
        }

        cb(null, this)
      }
    })

    return promise
  }

  download (options, cb) {
    if (typeof options === 'function') {
      cb = options
      options = {}
    }

    if (!options) options = {}
    const start = options.start || 0
    const apiStart = options.returnCiphertext ? start : start - start % 16
    let end = options.end || null

    const maxConnections = options.maxConnections || 4
    const initialChunkSize = options.initialChunkSize || 128 * 1024
    const chunkSizeIncrement = options.chunkSizeIncrement || 128 * 1024
    const maxChunkSize = options.maxChunkSize || 1024 * 1024
    const ssl = API.handleForceHttps(options.forceHttps) ? 2 : 0

    const req = {
      a: 'g',
      g: 1,
      ssl
    }
    if (this.nodeId) {
      req.n = this.nodeId
    } else if (Array.isArray(this.downloadId)) {
      req._querystring = {
        n: this.downloadId[0]
      }
      req.n = this.downloadId[1]
    } else {
      req.p = this.downloadId
    }

    if (this.directory) throw Error("Can't download: folder download isn't supported")

    // If options.returnCiphertext is true then the ciphertext is returned.
    // The result can be decrypted later using mega.decrypt() stream
    if (!this.key && !options.returnCiphertext) throw Error("Can't download: key isn't defined")

    const decryptStream = this.key && !options.returnCiphertext
      ? megaDecrypt(this.key, {
        start: apiStart,
        disableVerification: apiStart !== 0 || end !== null
      })
      : new PassThrough()

    const stream = apiStart === start
      ? decryptStream
      : decryptStream.pipe(new StreamSkip({
        skip: start - apiStart
      }))

    const handleRetries = options.handleRetries || File.defaultHandleRetries

    this.api.request(req, (err, response) => {
      if (err) return stream.emit('error', err)
      if (typeof response.g !== 'string' || response.g.substr(0, 4) !== 'http') {
        return stream.emit('error', Error('MEGA servers returned an invalid response, maybe caused by rate limit'))
      }

      // Special case for empty files
      if (response.s === 0) return stream.end()

      if (!end) end = response.s - 1
      if (start > end) return stream.emit('error', Error("You can't download past the end of the file."))

      function handleMegaErrors (resp) {
        if (resp.status === 200) return
        if (resp.status === 509) {
          const timeLimit = resp.headers.get('x-mega-time-left')
          const error = Error('Bandwidth limit reached: ' + timeLimit + ' seconds until it resets')

          // Export error as a property of the error
          error.timeLimit = timeLimit

          stream.emit('error', error)
          return
        }

        stream.emit('error', Error('MEGA returned a ' + resp.status + ' status code'))
      }

      function handleError (err) {
        stream.emit('error', err)
      }

      // Handle progress events
      let i = 0
      stream.on('data', d => {
        i += d.length
        stream.emit('progress', {
          bytesLoaded: i,
          bytesTotal: response.s
        })
      })

      // If maxConnections is 1 then disable chunking
      if (maxConnections === 1) {
        const controller = new AbortController()
        // Abort stream if required
        stream.on('close', () => {
          controller.abort()
        })

        this.api.fetch(response.g + '/' + apiStart + '-' + end, {
          signal: controller.signal
        }).then(response => {
          handleMegaErrors(response)
          const body = response.body
          if (!body) {
            throw Error('Missing response body')
          } else if (body.pipe) {
            response.body.pipe(decryptStream)
          } else if (body.getReader) {
            const reader = body.getReader()
            const read = ({ done, value }) => {
              if (done) {
                decryptStream.end()
              } else {
                decryptStream.write(value)
                return reader.read().then(read)
              }
            }
            reader.read().then(read)
          } else {
            throw Error('Single connection streaming not supported by fetch')
          }
        }).catch(handleError)

        return
      }

      const chunkBuffer = {}
      let lastStartedChunk = 0
      let nextChunk = 0
      let stopped = false
      let currentOffset = apiStart
      let chunkSize = initialChunkSize

      // Stop the stream on errors and if required
      stream.on('error', () => {
        stopped = true
      })
      stream.on('close', () => {
        stopped = true
      })

      const getChunk = () => {
        if (currentOffset > end) {
          stopped = true
          if (lastStartedChunk === nextChunk) {
            decryptStream.end()
          }
          return
        }

        const chunkOffset = currentOffset
        const chunkMax = Math.min(end, chunkOffset + chunkSize - 1)
        const chunkNumber = lastStartedChunk++

        let tries = 0
        const tryFetchChunk = () => {
          tries++

          this.api.fetch(response.g + '/' + chunkOffset + '-' + chunkMax)
            .then(response => {
              handleMegaErrors(response)
              return response.arrayBuffer()
            }).then(data => {
              const dataBuffer = Buffer.from(data)
              chunkBuffer[chunkNumber] = dataBuffer
              if (nextChunk === chunkNumber) {
                handleStreamWrite()
              }
            }, error => {
              handleRetries(tries, error, error => {
                if (error) {
                  handleError(error)
                } else {
                  tryFetchChunk()
                }
              })
            })
        }
        tryFetchChunk()

        currentOffset = chunkMax + 1
        if (chunkSize < maxChunkSize) {
          chunkSize = chunkSize + chunkSizeIncrement
        }
      }

      const handleStreamWrite = () => {
        let shouldWaitDrain

        // Check if the next chunk is in the buffer
        while (true) {
          const bufferChunk = chunkBuffer[nextChunk]
          if (!bufferChunk) break
          shouldWaitDrain = !decryptStream.write(bufferChunk)
          delete chunkBuffer[nextChunk]
          nextChunk++
          if (shouldWaitDrain) break
        }

        // Check if the stream stopped and if it's the last chunk then end the stream
        if (stopped && lastStartedChunk === nextChunk) {
          decryptStream.end()
        }

        if (shouldWaitDrain) {
          decryptStream.once('drain', handleStreamWrite)
        } else {
          getChunk()
        }
      }

      for (let i = 0; i < maxConnections; i++) {
        getChunk()
      }
    })

    if (cb) streamToCb(stream, cb)

    return stream
  }

  // Just wraps the download function as it can't adapted to
  // use promises without causing performance issues.
  downloadBuffer (options, originalCb) {
    const [cb, promise] = createPromise(originalCb)
    this.download(options, cb)
    return promise
  }

  link (options, originalCb) {
    if (arguments.length === 1 && typeof options === 'function') {
      originalCb = options
      options = {
        noKey: false
      }
    }
    const [cb, promise] = createPromise(originalCb)

    if (typeof options === 'boolean') {
      options = {
        noKey: options
      }
    }

    let url = `https://mega.nz/${this.directory ? 'folder' : 'file'}/${this.downloadId}`
    if (!options.noKey && this.key) url += `#${e64(this.key)}`
    if (!options.noKey && this.loadedFile) {
      // TODO: check if the loaded file is, in fact, a folder
      url += `/file/${this.loadedFile}`
    }

    // Is a synchronous function, but returns a promise to keep the same signature as MutableFile
    cb(null, url)
    return promise
  }

  find (query, deep) {
    if (!this.children) throw Error('You can only call .find on directories')

    if (typeof query === 'string') {
      const queryString = query
      query = file => file.name === queryString
    } else if (Array.isArray(query)) {
      const queryArray = query
      query = file => queryArray.includes(file.name)
    }
    if (typeof query !== 'function') {
      throw Error('Query must be a file matching function, an array of valid file names or a string with a file name')
    }

    return this.children.reduce((result, entry) => {
      if (result) return result
      if (query(entry)) return entry
      if (entry.children && deep) {
        return entry.find(query, deep)
      }
      return null
    }, null)
  }

  filter (query, deep) {
    if (!this.children) throw Error('You can only call .filter on directories')

    if (typeof query === 'string') {
      const queryString = query
      query = file => file.name === queryString
    } else if (Array.isArray(query)) {
      const queryArray = query
      query = file => queryArray.includes(file.name)
    }
    if (typeof query !== 'function') {
      throw Error('Query must be a file matching function, an array of valid file names or a string with a file name')
    }

    return this.children.reduce((results, entry) => {
      if (query(entry)) results.push(entry)
      if (entry.children && deep) {
        return results.concat(entry.filter(query, deep))
      }
      return results
    }, [])
  }

  navigate (query) {
    if (!this.children) throw Error('You can only call .navigate on directories')

    if (typeof query === 'string') {
      query = query.split('/')
    } else if (!Array.isArray(query)) {
      throw Error('Query must be an array or a string')
    }

    return query.reduce((node, name) => {
      return node && node.children && node.children.find(e => e.name === name)
    }, this)
  }

  static fromURL (opt, extraOpt = {}) {
    if (typeof opt === 'object') {
      // todo: warn to use File directly
      return new File(opt)
    }

    // Supported formats:
    // Old format:
    // https://mega.nz/#!file_handler
    // https://mega.nz/#!file_handler!file_key
    // https://mega.nz/#F!folder_handler
    // https://mega.nz/#F!folder_handler!folder_key
    // https://mega.nz/#F!folder_handler!folder_key!file_handler
    // New format (2020):
    // https://mega.nz/file/file_handler
    // https://mega.nz/file/file_handler#file_key
    // https://mega.nz/folder/folder_handler
    // https://mega.nz/folder/folder_handler#folder_key
    // https://mega.nz/folder/folder_handler#folder_key/file/file_handler

    const url = new URL(opt)
    if (url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') throw Error('Invalid URL: wrong hostname')
    if (!url.hash) throw Error('Invalid URL: no hash')

    if (url.pathname.match(/\/(file|folder)\//) !== null) {
      // new format
      const split = url.hash.substr(1).split('/file/')
      const fileHandler = url.pathname.substring(
        url.pathname.lastIndexOf('/') + 1,
        url.pathname.length + 1
      )
      const fileKey = split[0]

      if ((fileHandler && !fileKey) || (!fileHandler && fileKey)) throw Error('Invalid URL: too few arguments')

      return new File({
        downloadId: fileHandler,
        key: fileKey,
        directory: url.pathname.indexOf('/folder/') >= 0,
        loadedFile: split[1],
        ...extraOpt
      })
    } else {
      // old format
      const split = url.hash.split('!')
      if (split[0] !== '#' && split[0] !== '#F') throw Error('Invalid URL: format not recognized')
      if (split.length <= 1) throw Error('Invalid URL: too few arguments')
      if (split.length >= (split[0] === '#' ? 4 : 5)) throw Error('Invalid URL: too many arguments')

      return new File({
        downloadId: split[1],
        key: split[2],
        directory: split[0] === '#F',
        loadedFile: split[3],
        ...extraOpt
      })
    }
  }

  static unpackAttributes (at) {
    // read until the first null byte
    let end = 0
    while (end < at.length && at.readUInt8(end)) end++

    at = at.slice(0, end).toString()
    if (at.substr(0, 6) !== 'MEGA{"') return

    try {
      return JSON.parse(at.substr(4))
    } catch (e) {}
  }

  static defaultHandleRetries (tries, error, cb) {
    if (tries > 8) {
      cb(error)
    } else {
      setTimeout(cb, 1000 * Math.pow(2, tries))
    }
  }
}

const LABEL_NAMES = ['', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey']

export default File
export {
  LABEL_NAMES
}
