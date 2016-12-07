// import {EventEmitter} from 'events'
import {detectSize, streamToCb} from './util'
import request from 'request'
import pipeline from 'stream-combiner'
import * as crypto from './crypto'
import { RSAdecrypt, mpi2b, b2s } from './crypto/rsa'
import {API} from './api'
import {File} from './file'
import mega from './mega'
import through from 'through'
import secureRandom from 'secure-random'

class Storage /* extends EventEmitter */ {
  constructor (options, cb) {
    // super()
    const self = this
    if (arguments.length === 1 && typeof options === 'function') {
      cb = options
      options = {}
    }

    if (!cb) {
      cb = function (err) {
        if (err) throw err // Would be nicer to emit error event?
      }
    }

    // Defaults
    options.keepalive = options.keepalive === undefined ? true : !!options.keepalive
    options.autoload = options.autoload === undefined ? true : !!options.autoload

    this.api = new API(options.keepalive)
    this.files = {}

    function ready () {
      self.status = 'ready'
      cb()
      self.emit('ready', self)
    }

    function loadUser (cb) {
      self.api.request({a: 'ug'}, (err, response) => {
        if (err) return cb(err)
        self.name = response.name
        self.user = response.u

        if (options.autoload) {
          self.reload(err => {
            if (err) return cb(err)
            ready()
          }, true)
        }
        else ready()
      })
    }

    if (options.email) {
      this.email = options.email
      const pw = crypto.prepareKey(new Buffer(options.password))
      let aes = new crypto.AES(pw)
      const uh = aes.stringhash(new Buffer(options.email))

      this.api.request({a: 'us', user: options.email, uh: uh}, (err, response) => {
        if (err) return cb(err)
        self.key = crypto.formatKey(response.k)
        aes.decryptKey(self.key)
        self.aes = new crypto.AES(self.key)

        const t = mpi2b(crypto.formatKey(response.csid).toString('binary'))
        let privk = self.aes.decryptKey(crypto.formatKey(response.privk)).toString('binary')

        let rsa_privk = Array(4)

        // decompose private key
        for (let i = 0; i < 4; i++) {
          const l = ((privk.charCodeAt(0) * 256 + privk.charCodeAt(1) + 7) >> 3) + 2
          rsa_privk[i] = rsa.mpi2b(privk.substr(0, l))
          if (typeof rsa_privk[i] === 'number') break
          privk = privk.substr(l)
        }

        let sid = new Buffer(b2s(RSAdecrypt(t, rsa_privk[2], rsa_privk[0], rsa_privk[1], rsa_privk[3])).substr(0, 43), 'binary')
        sid = crypto.e64(sid)

        self.api.sid = self.sid = sid
        self.RSAPrivateKey = rsa_privk

        loadUser(cb)
      })
    } else {
      throw Error('no credentials')
    }

    this.status = 'connecting'
  }

  reload (cb, force) {
    const self = this
    if (self.status === 'connecting' && !force) {
      return this.once('ready', this.reload.bind(this, cb))
    }
    this.mounts = []
    this.api.request({a: 'f', c: 1}, (err, response) => {
      if (err) return cb(err)
      response.f.forEach(self._importFile.bind(self))
      cb(null, self.mounts)
    })

    this.api.on('sc', arr => {
      const deleted = {}
      arr.forEach(o => {
        if (o.a === 'u') {
          const file = self.files[o.n]
          if (file) {
            file.timestamp = o.ts
            file._setAttributes(o.at, () => {})
            file.emit('update')
            self.emit('update', file)
          }
        } else if (o.a === 'd') {
          deleted[o.n] = true // Don't know yet if move or delete.
        } else if (o.a === 't') {
          o.t.f.forEach(f => {
            const file = self.files[f.h]
            if (file) {
              delete deleted[f.h]
              const oldparent = file.parent
              if (oldparent.nodeId === f.p) return
              // todo: move to setParent() to avoid duplicate.
              oldparent.children.splice(oldparent.children.indexOf(file), 1)
              file.parent = self.files[f.p]
              if (!file.parent.children) file.parent.children = []
              file.parent.children.push(file)
              file.emit('move', oldparent)
              self.emit('move', file, oldparent)
            } else {
              self.emit('add', self._importFile(f))
            }
          })
        }
      })

      Object.keys(deleted).forEach(n => {
        const file = self.files[n]
        const parent = file.parent
        parent.children.splice(parent.children.indexOf(file), 1)
        self.emit('delete', file)
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
    const self = this

    File.getCipher(key).encryptCBC(at)
    this.aes.encryptKey(key)

    this.api.request({
      a: 'p',
      t: opt.target.nodeId ? opt.target.nodeId : opt.target,
      n: [{
        h: 'xxxxxxxx',
        t: 1,
        a: crypto.e64(at),
        k: crypto.e64(key)
      }]}, (err, response) => {
        if (err) return returnError(err)
        const file = self._importFile(response.f[0])
        self.emit('add', file)

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

    const self = this
    const encrypter = mega.encrypt()
    const pause = through().pause()
    let stream = pipeline(pause, encrypter)

    function returnError (e) {
      if (cb) cb(e)
      else stream.emit('error', e)
    }

    // Size is needed before upload. Kills the streaming otherwise.
    let size = opt.size
    if (buffer) {
      size = buffer.length
      stream.write(buffer)
      stream.end()
    }

    let upload = defaultUpload

    // Wait for ready event.
    if (this.status === 'connecting') {
      const _upload = upload
      upload = function (s) {
        self.on('ready', () => { _upload(s) })
      }
    }

    if (size) {
      upload(size)
    } else {
      stream = pipeline(detectSize(upload), stream)
    }

    function defaultUpload (size) {
      if (!opt.target) opt.target = self.root

      self.api.request({a: 'u', ssl: 0, ms: '-1', s: size, r: 0, e: 0}, (err, resp) => {
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
          File.getCipher(key).encryptCBC(at)

          self.aes.encryptKey(key)

          self.api.request({
            a: 'p',
            t: opt.target.nodeId ? opt.target.nodeId : opt.target,
            n: [{
              h: hash.toString(),
              t: 0,
              a: crypto.e64(at),
              k: crypto.e64(key)
            }]}, (err, response) => {
              if (err) return returnError(err)
              const file = self._importFile(response.f[0])
              self.emit('add', file)

              stream.emit('complete', file)

              if (cb) {
                cb(null, file)
              }
            })
        })

        let size_check = 0
        encrypter.on('data', d => {
          size_check += d.length
          stream.emit('progress', {bytesLoaded: size_check, bytesTotal: size})
        })
        encrypter.on('end', () => {
          if (size && size_check !== size) {
            return stream.emit('error', new Error('Specified data size does not match.'))
          }
        })

        encrypter.pipe(httpreq)
        pause.resume()
      })
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

export {Storage}
