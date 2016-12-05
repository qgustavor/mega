var rollup = require('rollup')
var nodeResolve = require('rollup-plugin-node-resolve')
var babel = require('rollup-plugin-babel')
var commonjs = require('rollup-plugin-commonjs')
var globals = require('rollup-plugin-node-globals')
var builtins = require('rollup-plugin-node-builtins')
var alias = require('rollup-plugin-alias')
var json = require('rollup-plugin-json')

var fs = require('fs')
var path = require('path')

// as there is just one supported argument the line below is dead simple
var sourceMapEnabled = process.argv.includes('--generate-sourcemap')

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

console.error('Starting build...\nIt should end without any output between this line and the success line')

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
        request: path.resolve(__dirname, './shims/request.js')
      }),
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

      return writeFilePromise('dist/main.' + options.name + '.js', result.code)
    }))
  })
}))
.then(function () {
  console.log('Build completed with success')
})
.catch(function (error) {
  console.error(error.stack || error)
  throw error
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
