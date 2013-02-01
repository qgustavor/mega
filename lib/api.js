var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var request = require('request')
var querystring = require('querystring')

exports.API = API

var ERRORS = {
  1: 'EINTERNAL (-1): An internal error has occurred. Please submit a bug report, detailing the exact circumstances in which this error occurred.',
  2: 'EARGS (-2): You have passed invalid arguments to this command.',
  3: 'EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retry. Retries must be spaced with exponential backoff.',
  4: 'ERATELIMIT (-4): You have exceeded your command weight per time quota. Please wait a few seconds, then try again (this should never happen in sane real-life applications).',
  5: 'EFAILED (-5): The upload failed. Please restart it from scratch.',
  6: 'ETOOMANY (-6): Too many concurrent IP addresses are accessing this upload target URL.',
  7: 'ERANGE (-7): The upload file packet is out of range or not starting and ending on a chunk boundary.',
  8: 'EEXPIRED (-8): The upload target URL you are trying to access has expired. Please request a fresh one.',
  9: 'ENOENT (-9): Object (typically, node or user) not found',
  10: 'ECIRCULAR (-10): Circular linkage attempted',
  11: 'EACCESS (-11): Access violation (e.g., trying to write to a read-only share)',
  12: 'EEXIST (-12): Trying to create an object that already exists',
  13: 'EINCOMPLETE (-13): Trying to access an incomplete resource',
  14: 'EKEY (-14): A decryption operation failed (never returned by the API)',
  15: 'ESID (-15): Invalid or expired user session, please relogin',
  16: 'EBLOCKED (-16): User blocked',
  17: 'EOVERQUOTA (-17): Request over quota',
  18: 'ETEMPUNAVAIL (-18): Resource temporarily not available, please try again later'
}

var MAX_RETRIES = 3

function API() {
  this.counterId = Math.random().toString().substr(2, 10)
}
inherits(API, EventEmitter)

API.gateway = 'https://g.api.mega.co.nz/'

// Client-server request
API.prototype.request = function(json, cb, retryno) {
  var self = this
  var qs = {id: this.counterId++}
  if (this.sid) {
    qs.sid = this.sid
  }
  request({
    url: API.gateway + 'cs',
    qs: qs,
    method: 'POST',
    json: [json]
  }, function(err, req, resp) {
    // todo: parse numeric error codes
    if (!err && (typeof resp[0] == 'number') && resp[0] < 0) {
      if (resp[0] === -3) {
        retryno = retryno || 0
        if (retryno < MAX_RETRIES) {
          return setTimeout(function() {
            self.request(json, cb, retryno + 1)
          }, Math.pow(2, retryno + 1))
        }
      }
      err = new Error(ERRORS[-resp[0]])
    }
    else {
      if (resp[0] && resp[0].sn) {
        self.pull(resp[0].sn)
      }
    }
    // todo: process sn
    cb(err, resp[0])
  })
}

API.prototype.pull = function(sn) {
  var self = this
  this.sn = request({
    url: API.gateway + 'sc',
    qs: {sn: sn, sid: this.sid},
    method: 'POST',
    body: 'sc?' + querystring.stringify({sn:sn})
  }, function(err, req, body) {
    self.sn = undefined
    if (err) return console.log('mega server req failed')

    body = JSON.parse(body)

    if (body.w) {
      self.wait(body.w)
    }
    else if (body.sn) {
      if (body.a) {
        self.emit('sc', body.a)
      }
      self.pull(body.sn)
    }

  })
}

API.prototype.wait = function(url, sn) {
  var self = this
  this.sn = request({
    url: url,
    method: 'POST'
  }, function(err, req, body) {
    self.sn = undefined
    if (err) return console.log('mega server wait req failed')

    self.pull(sn)

  })
}

API.prototype.close = function() {
  if (this.sn) this.sn.abort()
}