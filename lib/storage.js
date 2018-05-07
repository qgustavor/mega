import { e64, prepareKey, formatKey, AES, constantTimeCompare } from './crypto'
import { cryptoDecodePrivKey, cryptoRsaDecrypt } from './crypto/rsa'
import { API } from './api'
import { EventEmitter } from 'events'
import MutableFile from './mutable-file'

class Storage extends EventEmitter {
  constructor (options, cb) {
    super()

    if (arguments.length === 1 && typeof options === 'function') {
      cb = options
      options = {}
    }

    if (!options.email) {
      throw Error("starting a session without credentials isn't supported")
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
    options.autologin = options.autologin === undefined ? true : !!options.autologin

    this.api = new API(options.keepalive)
    this.files = {}
    this.options = options

    if (options.autologin) {
      this.login(cb)
    } else {
      // Do not release Zalgo!
      process.nextTick(() => cb(null, this))
    }

    this.status = 'closed'
  }

  login (cb) {
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

        if (this.options.autoload) {
          this.reload(true, err => {
            if (err) return cb(err)
            ready()
          })
        } else {
          ready()
        }
      })
    }

    this.email = this.options.email
    const pw = prepareKey(Buffer.from(this.options.password))

    // after generating the AES key the password isn't needed anymore
    delete this.options.password

    let aes = new AES(pw)
    const uh = e64(aes.stringhash(Buffer.from(this.email)))

    this.api.request({a: 'us', user: this.email, uh}, (err, response) => {
      if (err) return cb(err)
      this.key = formatKey(response.k)
      aes.decryptECB(this.key)
      this.aes = new AES(this.key)

      const t = formatKey(response.csid)
      const privk = this.aes.decryptECB(formatKey(response.privk))
      const rsaPrivk = cryptoDecodePrivKey(privk)
      if (!rsaPrivk) throw Error('invalid credentials')

      let sid = e64(cryptoRsaDecrypt(t, rsaPrivk).slice(0, 43))

      this.api.sid = this.sid = sid
      this.RSAPrivateKey = rsaPrivk

      loadUser(cb)
    })

    this.status = 'connecting'
  }

  reload (force, cb) {
    if (typeof force === 'function') [force, cb] = [cb, force]
    if (this.status === 'connecting' && !force) {
      return this.once('ready', this.reload.bind(this, force, cb))
    }
    this.mounts = []
    this.api.request({a: 'f', c: 1}, (err, response) => {
      if (err) return cb(err)

      this.shareKeys = response.ok.reduce((shares, share) => {
        const handler = share.h

        // MEGA handles share authenticity by checking the value below
        const auth = this.aes.encryptECB(Buffer.from(handler + handler))

        // original implementation doesn't compare in constant time, but...
        if (constantTimeCompare(formatKey(share.ha), auth)) {
          shares[handler] = this.aes.decryptECB(formatKey(share.k))
        }

        // If verification fails the share was tampered... by MEGA servers.
        // Well, never trust the server, the code says...

        return shares
      }, {})

      response.f.forEach(file => this._importFile(file))
      cb(null, this.mounts)
    })

    this.api.on('sc', arr => {
      const deleted = {}
      arr.forEach(o => {
        if (o.a === 'u') {
          const file = this.files[o.n]
          if (file) {
            file.timestamp = o.ts
            try {
              file.decryptAttributes(o.at)
            } catch (err) {
              // Do not emit the file, instead emit a "file-decrypt-error"
              // so it can be handled seamlessly
              err.file = file
              this.emit('file-decrypt-error', err)
              return
            }
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
      const file = this.files[f.h] = new MutableFile(f, this)
      if (f.t === Storage.NODE_TYPE_DRIVE) {
        this.root = file
        file.name = 'Cloud Drive'
      }
      if (f.t === Storage.NODE_TYPE_RUBBISH_BIN) {
        this.trash = file
        file.name = 'Rubbish Bin'
      }
      if (f.t === Storage.NODE_TYPE_INBOX) {
        this.inbox = file
        file.name = 'Inbox'
      }
      if (f.t > 1) {
        this.mounts.push(file)
      }
      if (f.p) {
        let parent = this.files[f.p]
        if (!parent.children) parent.children = []
        parent.children.push(file)
        file.parent = parent
      }
    }
    return this.files[f.h]
  }

  // alternative to this.root.mkdir
  mkdir (opt, cb) {
    // Wait for ready event.
    if (this.status !== 'ready') {
      this.on('ready', () => {
        return this.root.mkdir(opt, cb)
      })
      return
    }
    return this.root.mkdir(opt, cb)
  }

  // alternative to this.root.upload
  upload (opt, buffer, cb) {
    // Wait for ready event.
    if (this.status !== 'ready') {
      this.on('ready', () => {
        return this.root.upload(opt, buffer, cb)
      })
      return
    }
    return this.root.upload(opt, buffer, cb)
  }

  close () {
    // does not handle still connecting or incomplete streams
    this.status = 'closed'
    this.api.close()
  }

  getAccountInfo (cb) {
    this.api.request({a: 'uq', strg: 1, xfer: 1, pro: 1}, (err, response) => {
      if (err) cb(err)
      const account = {}

      // Normalize responses from API
      account.type = response.utype
      account.spaceUsed = response.cstrg
      account.spaceTotal = response.mstrg
      account.downloadBandwidthTotal = response.mxfer || Math.pow(1024, 5) * 10
      account.downloadBandwidthUsed = response.caxfer || 0
      account.sharedBandwidthUsed = response.csxfer || 0
      account.sharedBandwidthLimit = response.srvratio

      cb(null, account)
    })
  }
}

Storage.NODE_TYPE_FILE = 0
Storage.NODE_TYPE_DIR = 1
Storage.NODE_TYPE_DRIVE = 2
Storage.NODE_TYPE_INBOX = 3
Storage.NODE_TYPE_RUBBISH_BIN = 4

export default Storage
