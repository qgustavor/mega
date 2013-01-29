var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var crypto = require('./crypto')
var rsa = require('./crypto/rsa')
var API = require('./api').API

exports.Storage = Storage

function Storage(email, pass, cb) {
  if (arguments.length === 1 && typeof email === 'function') {
    cb = email
    email = null
  }

  this.api = new API()

  if (email) {
    this.email = email
    var pw = crypto.prepare_key(new Buffer(pass))
    var aes = new crypto.AES(pw)
    var uh = aes.stringhash(new Buffer(email))
    var self = this
    this.api.request({a: 'us', user: email, uh: uh}, function(err, response) {
      console.log('resp', response)
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


      console.log('sessionid', sid)

      self.api.request({a: 'ug'}, function(err, response) {
        console.log('user', response)
      })



   })
    // key from passworf
    // hash email using key
    // api request
  }

  this.status = 'connecting'
}
inherits(Storage, EventEmitter)