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

  this.api = new API()
  this.files = {}

  if (email) {
    this.email = email
    var pw = crypto.prepare_key(new Buffer(pass))
    var aes = new crypto.AES(pw)
    var uh = aes.stringhash(new Buffer(email))
    var self = this
    this.api.request({a: 'us', user: email, uh: uh}, function(err, response) {
      if (err) throw(err)
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

      //console.log('sessionid', sid)

      self.api.request({a: 'ug'}, function(err, response) {
        //console.log('user', response)
        self.name = response.name
        self.user = response.u

        self.loadFiletree(function() {
          self.status = 'ready'
          self.emit('ready', self)
        })
      })

   })
  }

  this.status = 'connecting'
}
inherits(Storage, EventEmitter)

Storage.prototype.loadFiletree = function(cb) {
  var self = this
  this.root = []
  this.api.request({a: 'f', c: 1}, function(err, response) {
    //console.log('resp', response)
    if (err) return cb(err)
    response.f.forEach(self._importFile.bind(self))
    cb(null, self.root)
  })
}

Storage.prototype._importFile = function(f) {
  if (!this.files[f.h]) {
    var fo = this.files[f.h] = new File(f, this)
    if (f.t === Storage.NODE_TYPE_DRIVE) {
      this.drive = fo
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
      this.root.push(fo)
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
  if (!opt.target) opt.target = this.drive
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

  // size is needed before upload. kills the streaming.
  var size = opt.size
  if (buffer) {
    size = buffer.length
    stream.write(buffer)
    stream.end()
  }

  // hack for not blocking when size set (todo:fix)
  // somethings broken. Think this will buffer unneeded data.
  stream._write = stream.write
  var s = stream
  stream.write = function(b) {
    s._write(b)
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
        var url = resp.p
        //console.log('resp', resp)
        var r = request({
          url: url,
          headers: {'Content-Length': size},
          method: 'POST'
        })

        util.stream2cb(r, function(e, hash) {

          var key = en.key

          var at = JSON.stringify(opt.attributes)
          at = new Buffer('MEGA' + at)
          var ate = new Buffer(Math.ceil(at.length/16) * 16)
          ate.fill(0)
          at.copy(ate)
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
              var f = self._importFile(response.f[0])
              stream.emit('complete', f)

              if (cb) {
                cb(null, f)
              }
            })
          //console.log('body', e, hash.toString())
          //console.log('target', self.drive.nodeId)
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
