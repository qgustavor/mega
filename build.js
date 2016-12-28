var rollup = require('rollup')
var alias = require('rollup-plugin-alias')
var babel = require('rollup-plugin-babel')
var builtins = require('rollup-plugin-node-builtins')
var commonjs = require('rollup-plugin-commonjs')
var globals = require('rollup-plugin-node-globals')
var json = require('rollup-plugin-json')
var nodeResolve = require('rollup-plugin-node-resolve')
var replace = require('rollup-plugin-replace')
var compile = require('google-closure-compiler-js').compile

var fs = require('fs')
var path = require('path')

// as there is just one supported argument the line below is dead simple
var sourceMapEnabled = process.argv.includes('--generate-sourcemap')
var minify = process.argv.includes('--minify')

var formats = {
  browser: [{
    name: 'browser',
    moduleName: 'mega',
    format: 'umd'
  }],
  node: [
    { name: 'cjs', format: 'cjs' },
    { name: 'es', format: 'es' }
  ]
}

console.error('Starting build...')

const warnings = []
const handleWarning = (warning) => {
  warnings.push(warning)
}

Promise.all(Object.keys(formats).map(function (format) {
  var externalConfig = format === 'browser' ? [] : [
    'zlib', 'https', 'http', 'crypto', 'fs', 'tls',
    'net', 'string_decoder', 'assert', 'punycode',
    'dns', 'dgram', 'request', 'combined-stream',
    'url', 'through', 'stream-combiner', 'events',
    'secure-random', 'querystring'
  ]

  return rollup.rollup({
    entry: 'lib/mega.js',
    external: externalConfig,
    onwarn: handleWarning,
    plugins: [
      commonjs({
        include: [
          'node_modules/stream-combiner/**',
          'node_modules/combined-stream/**',
          'node_modules/secure-random/**',
          'node_modules/through/**',
          'lib/**'
        ]
      }),
      format === 'browser' && builtins(),
      format === 'browser' && globals(),
      format === 'browser' && alias({
        request: path.resolve(__dirname, './browser/request.js')
      }),
      format === 'browser' && replace({ values: {
        // handle cases where rollup-plugin-replace fails
        "from './crypto/rsa'": "from '../browser/rsa.js'",
        "from './aes'": "from '../../browser/aes.js'"
      }}),
      format === 'browser' && nodeResolve({
        jsnext: true,
        main: true,
        browser: format === 'browser',
        preferBuiltins: format !== 'browser'
      }),
      json(),
      babel({
        exclude: 'node_modules/**'
      })
    ]
  }).then(function (bundle) {
    return Promise.all(formats[format].map(function (options) {
      var result = bundle.generate(Object.assign({
        sourceMap: sourceMapEnabled && 'inline'
      }, options))

      if (minify && format === 'browser') {
        result.code = compile({
          rewritePolyfills: false,
          jsCode: [{src: result.code}]
        }).compiledCode
      }

      return writeFilePromise('dist/main.' + options.name + '.js', result.code)
    }))
  })
}))
.then(function () {
  if (warnings.length) {
    console.log('Build completed with warnings')
    console.log(Array.from(new Set(warnings)).join('\n'))
    process.exit(1)
  }

  console.log('Build completed with success')
})
.catch(function (error) {
  console.error(error.stack || error)
  process.exit(1)
})

function writeFilePromise (...argv) {
  return new Promise(function (resolve, reject) {
    fs.writeFile(...argv, function (err) {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
