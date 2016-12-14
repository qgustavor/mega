/* global self */

import stream from 'stream'
const global = typeof window !== 'undefined' ? window
: typeof self !== 'undefined' ? self
: typeof global !== 'undefined' ? this
: {}

// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License")
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

request.log = {
  'trace': noop,
  'debug': noop,
  'info': noop,
  'warn': noop,
  'error': noop
}

const DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request (options, callback) {
  if (!options) {
    throw new Error('No options given')
  }

  var optionsOnResponse = options.onResponse // Save this for later.

  if (typeof options === 'string') {
    options = {'uri': options}
  } else {
    options = JSON.parse(JSON.stringify(options)) // Use a duplicate for mutating.
  }

  options.onResponse = optionsOnResponse // And put it back.

  if (options.verbose) request.log = getLogger()

  if (options.url) {
    options.uri = options.url
    delete options.url
  }

  if (!options.uri && options.uri !== '') {
    throw Error('options.uri is a required argument')
  }

  if (typeof options.uri !== 'string') {
    throw Error('options.uri must be a string')
  }

  var unsupportedOptions = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupportedOptions.length; i++) {
    if (options[unsupportedOptions[i]]) {
      throw new Error('options.' + unsupportedOptions[i] + ' is not supported')
    }
  }

  options.callback = callback || noop
  options.method = options.method || 'GET'
  options.headers = options.headers || {}
  options.body = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if (options.headers.host) {
    throw new Error('Options.headers.host is not supported')
  }

  if (options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if (options.method !== 'GET') {
      options.headers['content-type'] = 'application/json'
    }

    if (typeof options.json !== 'boolean') {
      options.body = JSON.stringify(options.json)
    } else if (typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body)
    }
  }

  // BEGIN QS Hack
  var serialize = function (obj) {
    var str = []
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]))
      }
    }
    return str.join('&')
  }

  if (options.qs) {
    var qs = (typeof options.qs === 'string') ? options.qs : serialize(options.qs)
    if (options.uri.indexOf('?') !== -1) { // no get params
      options.uri = options.uri + '&' + qs
    } else { // existing get params
      options.uri = options.uri + '?' + qs
    }
  }
  // END QS Hack

  // BEGIN FORM Hack
  var multipart = function (obj) {
    // todo: support file type (useful?)
    var result = {}
    result.boundry = '-------------------------------' + Math.floor(Math.random() * 1000000000)
    var lines = []
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        lines.push(
          '--' + result.boundry + '\n' +
          'Content-Disposition: form-data; name="' + p + '"' + '\n' +
          '\n' +
          obj[p] + '\n'
        )
      }
    }
    lines.push('--' + result.boundry + '--')
    result.body = lines.join('')
    result.length = result.body.length
    result.type = 'multipart/form-data; boundary=' + result.boundry
    return result
  }

  if (options.form) {
    if (typeof options.form === 'string') throw Error('form name unsupported')
    if (options.method === 'POST') {
      var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase()
      options.headers['content-type'] = encoding
      switch (encoding) {
        case 'application/x-www-form-urlencoded':
          options.body = serialize(options.form).replace(/%20/g, '+')
          break
        case 'multipart/form-data':
          var multi = multipart(options.form)
          // options.headers['content-length'] = multi.length
          options.body = multi.body
          options.headers['content-type'] = multi.type
          break
        default : throw new Error('unsupported encoding:' + encoding)
      }
    }
  }
  // END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if (options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // HTTP basic authentication
  if (!options.headers.authorization && options.auth) {
    options.headers.authorization = 'Basic ' + b64Enc(options.auth.username + ':' + options.auth.password)
  }

  // Only use fetch if it supports streams
  if (typeof fetch === 'function' && typeof ReadableByteStream === 'function') {
    return runFetch(options)
  }
  return runXhr(options)
}

var reqSeq = 0
function runXhr (options) {
  var xhr = new global.XMLHttpRequest()
  var timedOut = false
  var isCors = isCrossDomain(options.uri)
  var supportsCors = ('withCredentials' in xhr)
  var offset = 0

  reqSeq += 1
  xhr.seq_id = reqSeq
  xhr.id = reqSeq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if (isCors && !supportsCors) {
    var corsErr = new Error('Browser does not support cross-origin request: ' + options.uri)
    corsErr.cors = 'unsupported'
    return options.callback(corsErr, xhr)
  }

  xhr.timeoutTimer = setTimeout(tooLate, options.timeout)
  function tooLate () {
    timedOut = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id': xhr._id, 'milliseconds': options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response': false, 'loading': false, 'end': false}

  xhr.overrideMimeType('text/plain; charset=x-user-defined')
  xhr.onreadystatechange = onStateChange
  xhr.open(options.method, options.uri, true) // asynchronous
  if (isCors) {
    xhr.withCredentials = !!options.withCredentials
  }
  xhr.send(options.body)

  var xhrStream = new stream.Readable()
  xhrStream._read = noop
  return xhrStream

  function onStateChange (event) {
    if (timedOut) {
      return request.log.debug('Ignoring timed out state change', {'state': xhr.readyState, 'id': xhr.id})
    }

    request.log.debug('State change', {'state': xhr.readyState, 'id': xhr.id, 'timedOut': timedOut})

    if (xhr.readyState === global.XMLHttpRequest.OPENED) {
      request.log.debug('Request started', {'id': xhr.id})
      for (var key in options.headers) {
        xhr.setRequestHeader(key, options.headers[key])
      }
    } else if (xhr.readyState === global.XMLHttpRequest.HEADERS_RECEIVED) {
      onResponse()
    } else if (xhr.readyState === global.XMLHttpRequest.LOADING) {
      onResponse()
      onLoading()
    } else if (xhr.readyState === global.XMLHttpRequest.DONE) {
      onResponse()
      onLoading()
      onEnd()
    }
  }

  function onResponse () {
    if (did.response) { return }

    did.response = true
    request.log.debug('Got response', {'id': xhr.id, 'status': xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if (isCors && xhr.statusCode === 0) {
      var corsErr = new Error('CORS request rejected: ' + options.uri)
      corsErr.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      xhrStream.emit('error', corsErr)

      return options.callback(corsErr, xhr)
    }

    options.onResponse(null, xhr)
  }

  function onLoading () {
    if (xhr.response) {
      var chunk = xhr.responseText.substr(offset)
      offset += chunk.length

      if (chunk.length > 0) {
        xhrStream.push(new Buffer(chunk, 'ascii'))
      }
    }

    if (did.loading) { return }

    did.loading = true
    request.log.debug('Response body loading', {'id': xhr.id})
  }

  function onEnd () {
    if (did.end) { return }

    did.end = true
    request.log.debug('Request done', {'id': xhr.id})
    xhrStream.push(null)

    xhr.body = xhr.responseText
    if (options.json) {
      try { xhr.body = JSON.parse(xhr.responseText) } catch (er) { xhrStream.emit('error', er); return options.callback(er, xhr) }
    }

    options.callback(null, xhr, xhr.body)
  }
} // request

function runFetch (options) {
  var xhr = {}

  reqSeq += 1
  xhr.seq_id = reqSeq
  xhr.id = reqSeq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  var fetchOptions = {}
  if (options.headers) { fetchOptions.headers = options.headers }
  if (options.method) { fetchOptions.method = options.method }
  if (options.body) { fetchOptions.body = options.body }

  global.fetch(options.uri || options.url, fetchOptions).then(response => {
    xhr.statusCode = xhr.status = response.status

    if (options.callback) {
      response.clone()[options.json ? 'json' : 'text']()
        .then(data => options.callback(null, xhr, data))
        .catch(error => options.callback(error))
    }

    var bodyStream = response.body.getReader()

    readLoop()
    function readLoop () {
      bodyStream.read().then(function (state) {
        if (state.done) {
          xhrStream.push(null)
        } else {
          xhrStream.push(new Buffer(state.value))
          readLoop()
        }
      })
    }
  }, error => {
    xhrStream.emit('error', error)
    options.callback(error)
  })

  var xhrStream = new stream.Readable()
  xhrStream._read = noop
  return xhrStream
} // fetch

request.withCredentials = false
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT

//
// defaults
//

request.defaults = function (options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if (typeof params === 'string') {
        params = {'uri': params}
      } else {
        params = JSON.parse(JSON.stringify(params))
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ]
shortcuts.forEach(function (shortcut) {
  var method = shortcut.toUpperCase()
  var func = shortcut.toLowerCase()

  request[func] = function (opts) {
    if (typeof opts === 'string') {
      opts = {'method': method, 'uri': opts}
    } else {
      opts = JSON.parse(JSON.stringify(opts))
      opts.method = method
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]))
    return request.apply(this, args)
  }
})

//
// Utility
//

function noop () {}

function getLogger () {
  var logger = {}
  var levels = ['trace', 'debug', 'info', 'warn', 'error']
  var level
  var i

  for (i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if (typeof console !== 'undefined' && console && console[level]) {
      logger[level] = formatted(console, level)
    }
  }

  return logger
}

function formatted (obj, method) {
  return formattedLogger

  function formattedLogger (str, context) {
    if (typeof context === 'object') {
      str += ' ' + JSON.stringify(context)
    }

    return obj[method](str)
  }
}

// Return whether a URL is a cross-domain request.
function isCrossDomain (url) {
  var rurl = /^([\w+.-]+:)(?:\/\/([^/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from global.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = global.location.href } catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement('a')
    ajaxLocation.href = ''
    ajaxLocation = ajaxLocation.href
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
  var parts = rurl.exec(url.toLowerCase())

  var result = !!(
    parts && (
      parts[1] !== ajaxLocParts[1] ||
      parts[2] !== ajaxLocParts[2] ||
      (parts[3] || (parts[1] === 'http:' ? 80 : 443)) !== (ajaxLocParts[3] || (ajaxLocParts[1] === 'http:' ? 80 : 443))
    )
  )

  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64Enc (data) {
  // Encodes string using MIME base64 algorithm
  var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  var o1
  var o2
  var o3
  var h1
  var h2
  var h3
  var h4
  var bits
  var i = 0
  var ac = 0
  var enc = ''
  var tmpArr = []

  if (!data) {
    return data
  }

  // assume utf8 data
  // data = this.utf8_encode(data+'')

  do { // pack three octets into four hexets
    o1 = data.charCodeAt(i++)
    o2 = data.charCodeAt(i++)
    o3 = data.charCodeAt(i++)

    bits = o1 << 16 | o2 << 8 | o3

    h1 = bits >> 18 & 0x3f
    h2 = bits >> 12 & 0x3f
    h3 = bits >> 6 & 0x3f
    h4 = bits & 0x3f

    // use hexets to index into b64, and append result to encoded string
    tmpArr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4)
  } while (i < data.length)

  enc = tmpArr.join('')

  switch (data.length % 3) {
    case 1:
      enc = enc.slice(0, -2) + '=='
      break
    case 2:
      enc = enc.slice(0, -1) + '='
      break
  }

  return enc
}

export default request
