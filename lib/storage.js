import * as crypto from './crypto'
import mega from './mega'
import pipeline from 'stream-combiner'
import request from 'request'
import secureRandom from 'secure-random'
import through from 'through'
import { cryptoDecodePrivKey, cryptoRsaDecrypt } from './crypto/rsa'
import {API} from './api'
import {EventEmitter} from 'events'
import {File} from './file'
import {detectSize, streamToCb} from './util'

class Storage extends EventEmitter {
  constructor (options, cb) {
    super()

    if (arguments.length === 1 && typeof options === 'function') {
      cb = options
      options = {}
    }

    if (!cb) {
      cb = (err) => {
        // Would be nicer to emit error event?
        if (err) throw err
      }
    }

    // Defaults
    options.keepalive = options.keepalive === undefined ? true : !!options.keepalive
    options.autoload = options.autoload === undefined ? true : !!options.autoload

    this.api = new API(options.keepalive)
    this.files = {}

    const ready = () => {
      this.status = 'ready'
      cb(null, this)
      this.emit('ready', this)
    }

    const loadUser = (cb) => {
      this.api.request({a: 'ug'}, (err, response) => {
        if (err) return cb(err)
        this.name = response.name
        this.user = response.u

        if (options.autoload) {
          this.reload(err => {
            if (err) return cb(err)
            ready()
          }, true)
        } else {
          ready()
        }
      })
    }

    if (options.email) {
      this.email = options.email
      const pw = crypto.prepareKey(new Buffer(options.password))
      let aes = new crypto.AES(pw)
      const uh = crypto.e64(aes.stringhash(new Buffer(options.email)))

      this.api.request({a: 'us', user: options.email, uh}, (err, response) => {
        if (err) return cb(err)
        this.key = crypto.formatKey(response.k)
        aes.decryptKey(this.key)
        this.aes = new crypto.AES(this.key)

        const t = crypto.formatKey(response.csid)
        const privk = this.aes.decryptKey(crypto.formatKey(response.privk))
        const rsaPrivk = cryptoDecodePrivKey(privk)
        if (!rsaPrivk) throw Error('invalid credentials')

        let sid = crypto.e64(cryptoRsaDecrypt(t, rsaPrivk).slice(0, 43))

        this.api.sid = this.sid = sid
        this.RSAPrivateKey = rsaPrivk

        loadUser(cb)
      })
    } else {
      throw Error('no credentials')
    }

    this.status = 'connecting'
  }

  reload (cb, force) {
    if (this.status === 'connecting' && !force) {
      return this.once('ready', this.reload.bind(this, cb))
    }
    this.mounts = []
    this.api.request({a: 'f', c: 1}, (err, response) => {
      if (err) return cb(err)
      response.f.forEach(this._importFile.bind(this))
      cb(null, this.mounts)
    })

    this.api.on('sc', arr => {
      const deleted = {}
      arr.forEach(o => {
        if (o.a === 'u') {
          const file = this.files[o.n]
          if (file) {
            file.timestamp = o.ts
            file._setAttributes(o.at, () => {})
            file.emit('update')
            this.emit('update', file)
          }
        } else if (o.a === 'd') {
          deleted[o.n] = true // Don't know yet if move or delete.
        } else if (o.a === 't') {
          o.t.f.forEach(f => {
            const file = this.files[f.h]
            if (file) {
              delete deleted[f.h]
              const oldparent = file.parent
              if (oldparent.nodeId === f.p) return
              // todo: move to setParent() to avoid duplicate.
              oldparent.children.splice(oldparent.children.indexOf(file), 1)
              file.parent = this.files[f.p]
              if (!file.parent.children) file.parent.children = []
              file.parent.children.push(file)
              file.emit('move', oldparent)
              this.emit('move', file, oldparent)
            } else {
              this.emit('add', this._importFile(f))
            }
          })
        }
      })

      Object.keys(deleted).forEach(n => {
        const file = this.files[n]
        const parent = file.parent
        parent.children.splice(parent.children.indexOf(file), 1)
        this.emit('delete', file)
        file.emit('delete')
      })
    })
  }

  _importFile (f) {
    // todo: no support for updates
    if (!this.files[f.h]) {
      const fo = this.files[f.h] = new File(f, this)
      if (f.t === Storage.NODE_TYPE_DRIVE) {
        this.root = fo
        fo.name = 'Cloud Drive'
      }
      if (f.t === Storage.NODE_TYPE_RUBBISH_BIN) {
        this.trash = fo
        fo.name = 'Rubbish Bin'
      }
      if (f.t === Storage.NODE_TYPE_INBOX) {
        this.inbox = fo
        fo.name = 'Inbox'
      }
      if (f.t > 1) {
        this.mounts.push(fo)
      }
      if (f.p) {
        let parent = this.files[f.p]
        if (!parent.children) parent.children = []
        parent.children.push(fo)
        fo.parent = parent
      }
    }
    return this.files[f.h]
  }

  mkdir (opt, cb) {
    if (typeof opt === 'string') {
      opt = {name: opt}
    }
    if (!opt.attributes) opt.attributes = {}
    if (opt.name) opt.attributes.n = opt.name

    if (!opt.attributes.n) {
      return process.nextTick(() => {
        cb(new Error('File name is required.'))
      })
    }

    // Wait for ready event.
    if (this.status === 'connecting') {
      return this.on('ready', this.mkdir.bind(this, opt, cb))
    }

    if (!opt.target) opt.target = this.root
    if (!opt.key) opt.key = secureRandom(32)

    const key = opt.key
    const at = File.packAttributes(opt.attributes)

    crypto.getCipher(key).encryptCBC(at)
    this.aes.encryptECB(key)

    this.api.request({
      a: 'p',
      t: opt.target.nodeId ? opt.target.nodeId : opt.target,
      n: [{
        h: 'xxxxxxxx',
        t: 1,
        a: crypto.e64(at),
        k: crypto.e64(key)
      }]
    }, (err, response) => {
      if (err) return returnError(err)
      const file = this._importFile(response.f[0])
      this.emit('add', file)

      if (cb) {
        cb(null, file)
      }
    })

    function returnError (e) {
      if (cb) cb(e)
    }
  }

  upload (opt, buffer, cb) {
    if (arguments.length === 2 && typeof buffer === 'function') {
      cb = buffer
      buffer = null
    }

    if (typeof opt === 'string') {
      opt = {name: opt}
    }

    if (!opt.attributes) opt.attributes = {}
    if (opt.name) opt.attributes.n = opt.name

    if (!opt.attributes.n) {
      throw new Error('File name is required.')
    }

    const encrypter = mega.encrypt()
    const pause = through().pause()
    let stream = pipeline(pause, encrypter)

    const returnError = (e) => {
      if (cb) {
        cb(e)
      } else {
        stream.emit('error', e)
      }
    }

    // Size is needed before upload. Kills the streaming otherwise.
    let size = opt.size
    if (buffer) {
      size = buffer.length
      stream.write(buffer)
      stream.end()
    }

    let upload = (size) => {
      if (!opt.target) opt.target = this.root

      this.api.request({a: 'u', ssl: 0, ms: '-1', s: size, r: 0, e: 0}, (err, resp) => {
        if (err) return returnError(err)

        const httpreq = request({
          uri: resp.p,
          headers: {'Content-Length': size},
          method: 'POST'
        })

        streamToCb(httpreq, (err, hash) => {
          if (err) return returnError(err)
          const key = encrypter.key
          const at = File.packAttributes(opt.attributes)
          crypto.getCipher(key).encryptCBC(at)

          this.aes.encryptECB(key)

          this.api.request({
            a: 'p',
            t: opt.target.nodeId ? opt.target.nodeId : opt.target,
            n: [{
              h: hash.toString(),
              t: 0,
              a: crypto.e64(at),
              k: crypto.e64(key)
            }]
          }, (err, response) => {
            if (err) return returnError(err)
            const file = this._importFile(response.f[0])
            this.emit('add', file)

            stream.emit('complete', file)

            if (cb) {
              cb(null, file)
            }
          })
        })

        let sizeCheck = 0
        encrypter.on('data', d => {
          sizeCheck += d.length
          stream.emit('progress', {bytesLoaded: sizeCheck, bytesTotal: size})
        })
        encrypter.on('end', () => {
          if (size && sizeCheck !== size) {
            return stream.emit('error', new Error('Specified data size does not match.'))
          }
        })

        encrypter.pipe(httpreq)
        pause.resume()
      })
    }

    // Wait for ready event.
    if (this.status === 'connecting') {
      const _upload = upload
      upload = (s) => {
        this.on('ready', () => { _upload(s) })
      }
    }

    if (size) {
      upload(size)
    } else {
      stream = pipeline(detectSize(upload), stream)
    }

    return stream
  }

  close () {
    // does not handle, if still connecting or incomplete streams.
    this.status = 'closed'
    this.api.close()
  }
}

Storage.NODE_TYPE_FILE = 0
Storage.NODE_TYPE_DIR = 1
Storage.NODE_TYPE_DRIVE = 2
Storage.NODE_TYPE_INBOX = 3
Storage.NODE_TYPE_RUBBISH_BIN = 4

export { Storage }
