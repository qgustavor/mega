import { EventEmitter } from 'events'
import request from 'request'
import querystring from 'querystring'

const MAX_RETRIES = 4
const ERRORS = {
  1: 'EINTERNAL (-1): An internal error has occurred. Please submit a bug report, detailing the exact circumstances in which this error occurred.',
  2: 'EARGS (-2): You have passed invalid arguments to this command.',
  3: 'EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retried ' + MAX_RETRIES + ' times.',
  4: 'ERATELIMIT (-4): You have exceeded your command weight per time quota. Please wait a few seconds, then try again (this should never happen in sane real-life applications).',
  5: 'EFAILED (-5): The upload failed. Please restart it from scratch.',
  6: 'ETOOMANY (-6): Too many concurrent IP addresses are accessing this upload target URL.',
  7: 'ERANGE (-7): The upload file packet is out of range or not starting and ending on a chunk boundary.',
  8: 'EEXPIRED (-8): The upload target URL you are trying to access has expired. Please request a fresh one.',
  9: 'ENOENT (-9): Object (typically, node or user) not found. Wrong password?',
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

const DEFAULT_GATEWAY = 'https://g.api.mega.co.nz/'

class API extends EventEmitter {
  constructor (keepalive) {
    super()
    this.keepalive = keepalive
    this.counterId = Math.random().toString().substr(2, 10)
    this.gateway = DEFAULT_GATEWAY
    this.requestModule = request
  }

  request (json, cb, retryno = 0) {
    const qs = {id: (this.counterId++).toString()}
    if (this.sid) {
      qs.sid = this.sid
    }

    if (typeof json._querystring === 'object') {
      Object.assign(qs, json._querystring)
      delete json._querystring
    }

    this.requestModule({
      uri: `${this.gateway}cs`,
      qs,
      method: 'POST',
      json: [json]
    }, (err, req, resp) => {
      if (err) return cb(err)

      if (!resp) return cb(Error('Empty response'))

      // Some error codes are returned as num, some as array with number.
      if (resp.length) resp = resp[0]

      if (!err && (typeof resp === 'number') && resp < 0) {
        if (resp === -3) {
          if (retryno < MAX_RETRIES) {
            return setTimeout(() => {
              this.request(json, cb, retryno + 1)
            }, Math.pow(2, retryno + 1) * 1e3)
          }
        }
        err = Error(ERRORS[-resp])
      } else {
        if (this.keepalive && resp && resp.sn) {
          this.pull(resp.sn)
        }
      }
      cb(err, resp)
    })
  }

  pull (sn, retryno = 0) {
    this.sn = this.requestModule({
      uri: `${this.gateway}sc`,
      qs: {sn, sid: this.sid},
      method: 'POST',
      json: true,
      body: `sc?${querystring.stringify({ sn })}`
    }, (err, req, resp) => {
      this.sn = undefined

      if (!err && (typeof resp === 'number') && resp < 0) {
        if (resp === -3) {
          if (retryno < MAX_RETRIES) {
            return setTimeout(() => {
              this.pull(sn, retryno + 1)
            }, Math.pow(2, retryno + 1) * 1e3)
          }
        }
        err = Error(ERRORS[-resp])
      }
      if (err) throw err

      if (resp.w) {
        this.wait(resp.w, sn)
      } else if (resp.sn) {
        if (resp.a) {
          this.emit('sc', resp.a)
        }
        this.pull(resp.sn)
      }
    })
  }

  wait (url, sn) {
    this.sn = this.requestModule({
      uri: url,
      method: 'POST'
    }, (err, req, body) => {
      this.sn = undefined
      if (err) throw Error('mega server wait req failed')

      this.pull(sn)
    })
  }

  close () {
    if (this.sn) this.sn.abort()
  }
}

export { API }
