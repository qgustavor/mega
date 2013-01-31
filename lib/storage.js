var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var pausestream = require('pause-stream')
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

function Storage(email, pass, cb) {
  if (arguments.length === 1 && typeof email === 'function') {
    cb = email
    email = null
  }

  if (!cb) {
    cb = function(err) {
      if (err) throw(err)
    }
  }

  this.api = new API()
  this.files = {}
  var self = this

  function loadUser(cb) {
    self.api.request({a: 'ug'}, function(err, response) {
      if (err) return cb(err)
      //console.log('user', response)
      self.name = response.name
      self.user = response.u

      self.reload(function(err) {
        if (err) return cb(err)
        self.status = 'ready'
        self.emit('ready', self)
        cb()
      })
    })
  }

  if (email) {
    this.email = email
    var pw = crypto.prepare_key(new Buffer(pass))
    var aes = new crypto.AES(pw)
    var uh = aes.stringhash(new Buffer(email))

    this.api.request({a: 'us', user: email, uh: uh}, function(err, response) {
      if (err) return cb(err)
      //console.log('resp', response)
      self.key = new Buffer(crypto.formatKey(response.k))
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
      sid = crypto.base64Addons(sid.toString('base64'))

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
  this.aes = new crypto.AES(this.key)

  var aes = new crypto.AES(passwordKey)
  var k = new Buffer(this.key)
  aes.encryptKey(k)

  var ssc2 = new Buffer(ssc)
  this.aes.encryptKey(ssc2)

  var req = {
    a: 'up',
    k: crypto.base64Addons(k.toString('base64')),
    ts: crypto.base64Addons(Buffer.concat([ssc,  ssc2]).toString('base64'))
  }
  var self = this
  this.api.request(req, function(err, user) {
    if (err) cb(err)
    self.api.request({a: 'us', user: user}, function(err, response) {
      var t = new Buffer(crypto.base64Clean(response.tsid), 'base64')
      var t_0 = t.slice(0, 16)
      var t_1 = t.slice(t.length - 16)
      self.aes.encryptKey(t_0)
      if (t_0.toString('base64') != t_1.toString('base64')) {
        return cb(new Error('Invalid key on user creation.'))
      }
      self.api.sid = self.sid = response.tsid
      cb(null)
    })
  })

}

Storage.prototype.reload = function(cb) {
  var self = this
  this.mounts = []
  this.api.request({a: 'f', c: 1}, function(err, response) {
    //console.log('resp', response)
    if (err) return cb(err)
    response.f.forEach(self._importFile.bind(self))
    cb(null, self.mounts)
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

Storage.prototype.upload = function(opt, buffer, cb) {
  if (arguments.length === 2 && typeof buffer === 'function') {
    cb = buffer
    buffer = null
  }

  if (typeof opt === 'string') {
    opt = {name: opt}
  }
  if (!opt.target) opt.target = this.root
  if (!opt.attributes) opt.attributes = {}
  if (opt.name) opt.attributes.n = opt.name

  if (!opt.attributes.n) {
    throw(new Error('file name is required'))
  }

  var self = this
  var en = mega.encrypt()
  var pause = pausestream()
  pause.pause()
  var stream = pipeline(pause, en)

  // pipeline bug fix (emit drain event)
  pause.on('drain', stream.emit.bind(stream, 'drain'))

  function returnError(e) {
    if (cb) cb(e)
    else stream.emit('error', e)
  }

  // size is needed before upload. kills the streaming.
  var size = opt.size
  if (buffer) {
    size = buffer.length
    stream.write(buffer)
    stream.end()
  }

  if (size) {
    upload(size)
  }
  else {
    stream = pipeline(util.detectSize(upload), stream)
  }

  function upload(size) {
    self.api.request({a: 'u', ssl: 0, ms: '-1', s: size, r: 0, e: 0},
      function(err, resp) {
        if (err) return returnError(err)
        var url = resp.p
        //console.log('resp', resp)
        var r = request({
          url: url,
          headers: {'Content-Length': size},
          method: 'POST'
        })

        util.stream2cb(r, function(err, hash) {
          if (err) return returnError(err)
          var key = en.key

          var at = JSON.stringify(opt.attributes)
          at = new Buffer('MEGA' + at)
          var ate = new Buffer(Math.ceil(at.length/16) * 16)
          ate.fill(0)
          at.copy(ate)
          // todo: this access via prototype is so wrong
          File.prototype._getCipher(key).encrypt_cbc(ate)

          self.aes.encryptKey(key)

          self.api.request({
            a: 'p',
            t: opt.target.nodeId ? opt.target.nodeId : opt.target,
            n: [{
              h: hash.toString(),
              t:0 ,
              a: crypto.base64Addons(ate.toString('base64')),
              k: crypto.base64Addons(key.toString('base64')),
            }]}, function(err, response) {
              if (err) return returnError(err)
              var f = self._importFile(response.f[0])
              stream.emit('complete', f)

              if (cb) {
                cb(null, f)
              }
            })
          //console.log('body', e, hash.toString())
          //console.log('target', self.root.nodeId)
        })

        var size_check = 0
        en.on('data', function(d) {
          size_check += d.length
        })
        en.on('end', function() {
          if (size && size_check != size) {
            return stream.emit('error', new Error('Specified data size does not match.'))
          }
        })

        en.pipe(r)
        pause.resume()

      })
  }

  return stream
}
