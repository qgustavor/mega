var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var request = require('request')
var crypto = require('./crypto')
var API = require('./api').API
var mega = require('./mega')
var util = require('./util')
var api = new API(false)

exports.File = File

function File(opt, storage) {
  this.downloadId = opt.downloadId
  this.key = crypto.formatKey(opt.key)
  if (storage && opt.h) {
    this.api = storage.api
    this.nodeId = opt.h
    this.timestamp = opt.ts
    this.type = opt.t
    this.directory = !!this.type

    if (opt.k) {
      var parts = opt.k.split(':')
      this.key = crypto.formatKey(parts[parts.length-1])
      storage.aes.decryptKey(this.key)
      this.size = opt.s || 0
      if (opt.a) this._setAttributes(opt.a, function() {})
      else this.name = ''
    }
  }
}
inherits(File, EventEmitter)

File.getCipher = function(key) {
  // 256 -> 128
  var k = new Buffer(16)
  for (var i = 0; i < 16; i++) {
    k.writeUInt8(key.readUInt8(i) ^ key.readUInt8(i + 16, true), i)
  }
  return new crypto.AES(k)
}

File.packAttributes = function(attributes) {
  var at = JSON.stringify(attributes)
  at = new Buffer('MEGA' + at)
  var ret = new Buffer(Math.ceil(at.length/16) * 16)
  ret.fill(0)
  at.copy(ret)
  return ret
}

File.unpackAttributes = function(at) {
  // remove empty bytes from end
  var end = at.length
  while (!at.readUInt8(end - 1)) end--

  at = at.slice(0, end).toString()
  if (at.substr(0,6) !== 'MEGA{"') {
    throw new Error('Attributes could not be decrypted with provided key.')
  }

  return JSON.parse(at.substring(4))
}

File.prototype._setAttributes = function(at, cb) {
  at = crypto.d64(at)
  File.getCipher(this.key).decryptCBC(at)

  try {
    at = File.unpackAttributes(at)
  }
  catch (e) {
    return cb(e)
  }

  this.attributes = at
  this.name = at.n

  cb(null, this)
}


File.prototype.loadAttributes = function(cb) {
  var req = {a: 'g', p: this.downloadId} // todo: nodeId version ('n')
  var self = this
  api.request(req, function(err, response) {
    if (err) return cb(err)

    self.size = response.s
    self._setAttributes(response.at, cb)

  })
}

File.prototype.download = function(cb) {
  var req = {a: 'g', g: 1}
  if (this.nodeId) {
    req.n = this.nodeId
  }
  else {
    req.p = this.downloadId
  }

  var stream = mega.decrypt(this.key)

  var cs = this.api || api
  cs.request(req, function(err, response) {
    if (err) return stream.emit('error', err)

    var r = request(response.g)
    r.pipe(stream)
    var i = 0
    r.on('data', function(d) {
      i += d.length
      stream.emit('progress', {bytesLoaded: i, bytesTotal: response.s})
    })
  })

  cb && util.stream2cb(stream, cb)
  return stream
}

File.prototype.delete = function(cb) {
  if (!this.nodeId) {
    return process.nextTick(function() {
      cb(new Error('delete is only supported on files with node ID-s'))
    })
  }
  this.api.request({a: 'd', n: this.nodeId}, cb)
}

File.prototype.link = function(noKey, cb) {
  if (arguments.length === 1 && typeof noKey === 'function') {
    cb = noKey
    noKey = false
  }
  if (!this.nodeId) {
    return process.nextTick(function() {
      cb(new Error('delete is only supported on files with node ID-s'))
    })
  }
  var self = this
  this.api.request({a: 'l', n: this.nodeId}, function(err, id) {
    if (err) return cb(err)
    var url = 'https://mega.co.nz/#!' + id
    if (!noKey) url += '!' + crypto.e64(self.key)
    cb(null, url)
  })
}