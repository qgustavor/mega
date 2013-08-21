var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var pipeline = require('stream-combiner')
var crypto = require('./crypto')
var rsa = require('./crypto/rsa')
var API = require('./api').API
var File = require('./file').File
var mega = require('./mega')
var request = require('request')
var through = require('through')
var util = require('./util')

exports.Storage = Storage

Storage.NODE_TYPE_FILE = 0
Storage.NODE_TYPE_DIR = 1
Storage.NODE_TYPE_DRIVE = 2
Storage.NODE_TYPE_INBOX = 3
Storage.NODE_TYPE_RUBBISH_BIN = 4

function Storage(options, cb) {
  if (arguments.length === 1 && typeof options === 'function') {
    cb = options
    options = {}
  }

  // Legacy email/password support. Deprecated.
  if (typeof options === 'string' && typeof cb === 'string') {
    console.log('Warning: new Storage(email, password) is deprecated!')
    options = {email: options, password: cb}
    if (arguments.length === 3 && typeof arguments[2] === 'function') {
      cb = arguments[2]
    }
  }

  if (!cb) {
    cb = function(err) {
      if (err) throw(err) //Would be nicer to emit error event?
    }
  }

  // Defaults
  options.keepalive = options.keepalive === undefined ? true : !!options.keepalive
  options.autoload = options.autoload === undefined ? true : !!options.autoload

  this.api = new API(options.keepalive)
  this.files = {}
  var self = this

  function ready() {
    self.status = 'ready'
    cb()
    self.emit('ready', self)
  }

  function loadUser(cb) {
    self.api.request({a: 'ug'}, function(err, response) {
      if (err) return cb(err)
      //console.log('user', response)
      self.name = response.name
      self.user = response.u

      if (options.autoload) {
        self.reload(function(err) {
          if (err) return cb(err)
          ready()
        }, true)
      }
      else ready()
    })
  }

  if (options.email) {
    this.email = options.email
    var pw = crypto.prepareKey(new Buffer(options.password))
    var aes = new crypto.AES(pw)
    var uh = aes.stringhash(new Buffer(options.email))

    this.api.request({a: 'us', user: options.email, uh: uh}, function(err, response) {
      if (err) return cb(err)
      //console.log('resp', response)
      self.key = crypto.formatKey(response.k)
      aes.decryptKey(self.key)
      self.aes = new crypto.AES(self.key)

      var t = rsa.mpi2b(crypto.formatKey(response.csid).toString('binary'))
      var privk = self.aes.decryptKey(crypto.formatKey(response.privk)).toString('binary')

      var r = false
      var rsa_privk = Array(4);

      // decompose private key
      for (var i = 0; i < 4; i++)
      {
        var l = ((privk.charCodeAt(0)*256+privk.charCodeAt(1)+7)>>3)+2;
        rsa_privk[i] = rsa.mpi2b(privk.substr(0,l));
        if (typeof rsa_privk[i] == 'number') break;
        privk = privk.substr(l);
      }

      var sid = new Buffer(rsa.b2s(rsa.RSAdecrypt(t,rsa_privk[2],rsa_privk[0],rsa_privk[1],rsa_privk[3])).substr(0,43), 'binary')
      sid = crypto.e64(sid)

      self.api.sid = self.sid = sid
      self.RSAPrivateKey = rsa_privk

      loadUser(cb)

   })
  }
  else {
    this._createUser(function(err) {
      if (err) return cb(err)
      loadUser(cb)
    })
  }

  this.status = 'connecting'
}
inherits(Storage, EventEmitter)

Storage.prototype._createUser = function(cb) {
  var nodeCrypto = require('crypto')
  var passwordKey = nodeCrypto.randomBytes(16)
  var ssc = nodeCrypto.randomBytes(16)
  this.key = nodeCrypto.randomBytes(16)

  // crypto-browserify currently returns arrays.
  if (!(passwordKey instanceof Buffer)) passwordKey = new Buffer(passwordKey)
  if (!(ssc instanceof Buffer)) ssc = new Buffer(ssc)
  if (!(this.key instanceof Buffer)) this.key = new Buffer(this.key)

  this.aes = new crypto.AES(this.key)

  var aes = new crypto.AES(passwordKey)
  var k = new Buffer(this.key)
  aes.encryptKey(k)

  var ssc2 = new Buffer(ssc)
  this.aes.encryptKey(ssc2)

  var req = {
    a: 'up',
    k: crypto.e64(k),
    ts: crypto.e64(Buffer.concat([ssc,  ssc2]))
  }
  var self = this
  this.api.request(req, function(err, user) {
    if (err) cb(err)
    self.api.request({a: 'us', user: user}, function(err, response) {
      if (err) return cb(err)
      var t = crypto.d64(response.tsid)
      var t_0 = t.slice(0, 16)
      var t_1 = t.slice(t.length - 16)
      self.aes.encryptKey(t_0)
      if (t_0.toString('base64') !== t_1.toString('base64')) {
        return cb(new Error('Invalid key on user creation.'))
      }
      self.api.sid = self.sid = response.tsid
      cb(null)
    })
  })

}

Storage.prototype.reload = function(cb, force) {
  if (this.status === 'connecting' && !force) {
    return this.once('ready', this.reload.bind(this, cb))
  }
  var self = this
  this.mounts = []
  this.api.request({a: 'f', c: 1}, function(err, response) {
    //console.log('resp', response)
    if (err) return cb(err)
    response.f.forEach(self._importFile.bind(self))
    cb(null, self.mounts)
  })

  this.api.on('sc', function(arr) {
    var deleted = {}
    arr.forEach(function(o) {
      if (o.a === 'u') {
        var file = self.files[o.n]
        if (file) {
          file.timestamp = o.ts
          file._setAttributes(o.at, function() {})
          file.emit('update')
          self.emit('update', file)
        }
      }
      else if (o.a === 'd') {
        deleted[o.n] = true // Don't know yet if move or delete.
      }
      else if (o.a === 't') {
        o.t.f.forEach(function(f) {
          var file
          if (file = self.files[f.h]) {
            delete deleted[f.h]
            var oldparent = file.parent
            if (oldparent.nodeId === f.p) return
            // todo: move to setParent() to avoid duplicate.
            oldparent.children.splice(oldparent.children.indexOf(file), 1)
            file.parent = self.files[f.p]
            if (!file.parent.children) file.parent.children = []
            file.parent.children.push(file)
            file.emit('move', oldparent)
            self.emit('move', file, oldparent)
          }
          else {
            self.emit('add', self._importFile(f))
          }
        })
      }
    })

    Object.keys(deleted).forEach(function(n) {
      var file = self.files[n]
      var parent = file.parent
      parent.children.splice(parent.children.indexOf(file), 1)
      self.emit('delete', file)
      file.emit('delete')
    })
  })
}

Storage.prototype._importFile = function(f) {
  // todo: no support for updates
  if (!this.files[f.h]) {
    var fo = this.files[f.h] = new File(f, this)
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
      var parent = this.files[f.p]
      if (!parent.children) parent.children = []
      parent.children.push(fo)
      fo.parent = parent
    }
  }
  return this.files[f.h]
}

Storage.prototype.mkdir = function(opt, cb) {
  if (typeof opt === 'string') {
    opt = {name: opt}
  }
  if (!opt.attributes) opt.attributes = {}
  if (opt.name) opt.attributes.n = opt.name

  if (!opt.attributes.n) {
    return process.nextTick(function() {
      cb(new Error('File name is required.'))
    })
  }

  // Wait for ready event.
  if (this.status === 'connecting') {
    return this.on('ready', this.mkdir.bind(this, opt, cb))
  }

  if (!opt.target) opt.target = this.root

  var key = require('crypto').randomBytes(32)
  var at = File.packAttributes(opt.attributes)
  var self = this

  File.getCipher(key).encryptCBC(at)
  this.aes.encryptKey(key)

  this.api.request({
    a: 'p',
    t: opt.target.nodeId ? opt.target.nodeId : opt.target,
    n: [{
      h: 'xxxxxxxx',
      t: 1,
      a: crypto.e64(at),
      k: crypto.e64(key),
    }]}, function(err, response) {
      if (err) return returnError(err)
      var file = self._importFile(response.f[0])
      self.emit('add', file)

      if (cb) {
        cb(null, file)
      }
    })
}

Storage.prototype.upload = function(opt, buffer, cb) {
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
    throw(new Error('File name is required.'))
  }

  var self = this
  var encrypter = mega.encrypt()
  var pause = through().pause()
  var stream = pipeline(pause, encrypter)

  function returnError(e) {
    if (cb) cb(e)
    else stream.emit('error', e)
  }

  // Size is needed before upload. Kills the streaming otherwise.
  var size = opt.size
  if (buffer) {
    size = buffer.length
    stream.write(buffer)
    stream.end()
  }

  // Wait for ready event.
  if (this.status === 'connecting') {
    var _upload = upload
    upload = function(s) {
      self.on('ready', function() { _upload(s) })
    }
  }

  if (size) {
    upload(size)
  }
  else {
    stream = pipeline(util.detectSize(upload), stream)
  }

  function upload(size) {
    if (!opt.target) opt.target = self.root

    self.api.request({a: 'u', ssl: 0, ms: '-1', s: size, r: 0, e: 0},
      function(err, resp) {
        if (err) return returnError(err)

        var httpreq = request({
          url: resp.p,
          headers: {'Content-Length': size},
          method: 'POST'
        })

        util.stream2cb(httpreq, function(err, hash) {
          if (err) return returnError(err)
          var key = encrypter.key
          var at = File.packAttributes(opt.attributes)
          File.getCipher(key).encryptCBC(at)

          self.aes.encryptKey(key)

          self.api.request({
            a: 'p',
            t: opt.target.nodeId ? opt.target.nodeId : opt.target,
            n: [{
              h: hash.toString(),
              t: 0,
              a: crypto.e64(at),
              k: crypto.e64(key),
            }]}, function(err, response) {
              if (err) return returnError(err)
              var file = self._importFile(response.f[0])
              self.emit('add', file)

              stream.emit('complete', file)

              if (cb) {
                cb(null, file)
              }
            })
          //console.log('body', e, hash.toString())
          //console.log('target', self.root.nodeId)
        })

        var size_check = 0
        encrypter.on('data', function(d) {
          size_check += d.length
          stream.emit('progress', {bytesLoaded: size_check, bytesTotal: size})
        })
        encrypter.on('end', function() {
          if (size && size_check != size) {
            return stream.emit('error', new Error('Specified data size does not match.'))
          }
        })

        encrypter.pipe(httpreq)
        pause.resume()

      })
  }

  return stream
}

Storage.prototype.close = function() {
  // does not handle, if still connecting or incomplete streams.
  this.status = 'closed'
  this.api.close()
}
