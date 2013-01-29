var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var crypto = require('./crypto')
var rsa = require('./crypto/rsa')
var API = require('./api').API
var File = require('./file').File

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
    if (err) return cb(err)
    response.f.forEach(function(f) {
      if (!self.files[f.h]) {
        var fo = self.files[f.h] = new File(f, self)
        if (f.t === Storage.NODE_TYPE_DRIVE) {
          self.drive = fo
          fo.name = 'Cloud Drive'
        }
        if (f.t === Storage.NODE_TYPE_RUBBISH_BIN) {
          self.trash = fo
          fo.name = 'Rubbish Bin'
        }
        if (f.t === Storage.NODE_TYPE_INBOX) {
          self.inbox = fo
          fo.name = 'Inbox'
        }
        if (f.t > 1) {
          self.root.push(fo)
        }
        if (f.p) {
          var parent = self.files[f.p]
          if (!parent.children) parent.children = []
          parent.children.push(fo)
          fo.parent = parent
        }
      }
    })
    cb(null, self.root)
  })
}
