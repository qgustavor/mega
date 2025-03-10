import { EventEmitter } from 'events'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { createPromise } from './util.mjs'

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
  18: 'ETEMPUNAVAIL (-18): Resource temporarily not available, please try again later',
  19: 'ETOOMANYCONNECTIONS (-19)',
  24: 'EGOINGOVERQUOTA (-24)',
  25: 'EROLLEDBACK (-25)',
  26: 'EMFAREQUIRED (-26): Multi-Factor Authentication Required',
  27: 'EMASTERONLY (-27)',
  28: 'EBUSINESSPASTDUE (-28)',
  29: 'EPAYWALL (-29): ODQ paywall state',
  400: 'ETOOERR (-400)',
  401: 'ESHAREROVERQUOTA (-401)'
}

const DEFAULT_GATEWAY = 'https://g.api.mega.co.nz/'
const DEFAULT_HTTP_AGENT = process.env.IS_BROWSER_BUILD ? null : new HttpAgent({ keepAlive: true })
const DEFAULT_HTTPS_AGENT = process.env.IS_BROWSER_BUILD ? null : new HttpsAgent({ keepAlive: true })

class API extends EventEmitter {
  constructor (keepalive, opt = {}) {
    super()
    this.keepalive = keepalive
    this.counterId = Math.random().toString().substr(2, 10)
    this.gateway = opt.gateway || DEFAULT_GATEWAY

    // Set up a default user agent and keep-alive agent
    const packageVersion = process.env.PACKAGE_VERSION
    const shouldAvoidUA = API.getShouldAvoidUA()
    this.userAgent = opt.userAgent === null || shouldAvoidUA
      ? null
      : `${opt.userAgent || ''} megajs/${packageVersion}`.trim()

    this.httpAgent = opt.httpAgent || DEFAULT_HTTP_AGENT
    this.httpsAgent = opt.httpsAgent || DEFAULT_HTTPS_AGENT

    // Can be overridden to allow changing how fetching works
    // Like fetch it should return a Promise<Request>
    this.fetch = opt.fetch || this.defaultFetch.bind(this)

    this.closed = false
  }

  async defaultFetch (url, opts) {
    if (!opts) opts = {}
    if (!opts.agent) {
      opts.agent = url => url.protocol === 'http:' ? this.httpAgent : this.httpsAgent
    }

    if (this.userAgent) {
      if (!opts.headers) opts.headers = {}
      if (!opts.headers['user-agent']) opts.headers['user-agent'] = this.userAgent
    }

    if (!API.fetchModule) {
      if (typeof globalThis.fetch === 'function') {
        API.fetchModule = globalThis.fetch.bind(globalThis)
      } else {
        throw Error('globalThis.fetch not found!')
      }
    }

    return API.fetchModule(url, opts)
  }

  request (json, originalCb, retryno = 0) {
    const isLogout = json.a === 'sml'
    if (this.closed && !isLogout) throw Error('API is closed')
    const [cb, promise] = createPromise(originalCb)

    const qs = { id: (this.counterId++).toString() }
    if (this.sid) {
      qs.sid = this.sid
    }

    if (typeof json._querystring === 'object') {
      Object.assign(qs, json._querystring)
      delete json._querystring
    }

    this.fetch(`${this.gateway}cs?${new URLSearchParams(qs)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([json])
    }).then(handleApiResponse).then(resp => {
      if (this.closed && !isLogout) return
      if (!resp) return cb(Error('Empty response'))

      // Some error codes are returned as num, some as array with number.
      if (resp.length) resp = resp[0]

      let err
      if ((typeof resp === 'number') && resp < 0) {
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
    }).catch(err => {
      cb(err)
    })

    // TODO: find a way to simplify this promise->callback->promise chain
    return promise
  }

  pull (sn, retryno = 0) {
    const controller = new AbortController()
    const ssl = API.handleForceHttps() ? 1 : 0
    this.sn = controller
    this.fetch(`${this.gateway}sc?${new URLSearchParams({ sn, ssl, sid: this.sid })}`, {
      method: 'POST',
      signal: controller.signal
    }).then(handleApiResponse).then(resp => {
      this.sn = undefined
      if (this.closed) return

      if ((typeof resp === 'number') && resp < 0) {
        if (resp === -3) {
          if (retryno < MAX_RETRIES) {
            return setTimeout(() => {
              this.pull(sn, retryno + 1)
            }, Math.pow(2, retryno + 1) * 1e3)
          }
        }
        this.emit('error', Error(ERRORS[-resp]))
      }

      if (resp.w) {
        this.wait(resp.w, sn)
      } else if (resp.sn) {
        if (resp.a) {
          this.emit('sc', resp.a)
        }
        this.pull(resp.sn)
      }
    }).catch(ignoreAbortError).catch(error => {
      this.emit('error', error)
    })
  }

  wait (url, sn) {
    const controller = new AbortController()
    this.sn = controller
    this.fetch(url, {
      method: 'POST',
      signal: controller.signal
    })
      // Errors were ignored in original mega package
      .catch(() => {})
      .then(() => {
        // Body is ignored here
        this.sn = undefined
        this.pull(sn)
      })
  }

  close () {
    if (this.sn) this.sn.abort()
    this.closed = true
  }

  static getGlobalApi () {
    if (!API.globalApi) {
      API.globalApi = new API()
    }
    return API.globalApi
  }

  static handleForceHttps (userOpt) {
    if (userOpt != null) return userOpt
    return !!(globalThis.isSecureContext)
  }

  static getShouldAvoidUA () {
    // Checks defined using
    // - https://codepen.io/qgustavor/pen/JjqqBPp
    // - https://www.browserstack.com/screenshots/149d6d45a4a10de06e05f743190a4c12a9faa6ef

    // It's not possible to detect when a browser fails CORS requests by defining an user-agent
    // using feature detection, so the alternatives were using user-agent detection
    // (which is not ideal because might not catch Firefox forks) or hacks.

    // This library uses hacks:
    let headersErr
    try {
      globalThis.Headers()
    } catch (err) {
      headersErr = err.message
    }
    return !((globalThis.fetch + '').length === 38 && headersErr.includes('Headers'))
  }
}

function handleApiResponse (response) {
  // Issue 130: handle 'Server Too Busy' as -3
  if (response.statusText === 'Server Too Busy') {
    return -3
  }

  if (!response.ok) {
    throw Error(`Server returned error: ${response.statusText}`)
  }

  return response.json()
}

function ignoreAbortError (error) {
  if (error.name !== 'AbortError') throw error
}

export default API
