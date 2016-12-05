var fs = require('fs')
var rollup = require('rollup')
var nodeResolve = require('rollup-plugin-node-resolve')
var babel = require('rollup-plugin-babel')
var commonjs = require('rollup-plugin-commonjs')
var globals = require('rollup-plugin-node-globals')
var builtins = require('rollup-plugin-node-builtins')
var json = require('rollup-plugin-json')
var sourceMapEnabled = false // todo: use a command line argument to enable?

var formats = {
  browser: {
    moduleName: 'mega',
    format: 'umd'
  },
  cjs: { format: 'cjs' },
  es: { format: 'es' }
}

Object.keys(formats).forEach(function (format) {  
  var externalConfig = format === 'browser' ? [] : [
    'zlib', 'https', 'http', 'crypto', 'fs', 'tls',
    'net', 'string_decoder', 'assert', 'punycode',
    'dns', 'dgram'
  ]
  
  rollup.rollup({
    entry: 'lib/mega.js',
    external: externalConfig,
    plugins: [
      nodeResolve({
        jsnext: true,
        main: true,
        browser: format === 'browser',
        preferBuiltins: format !== 'browser'
      }),
      commonjs({
        namedExports: {
          'events': ['EventEmitter']
        }
      }),
      json(),
      globals(),
      builtins(),
      babel()
    ]
  }).then(function (bundle) {
    var result = bundle.generate(Object.assign({
      sourceMap: sourceMapEnabled
    }, formats[format]))
    var resultCode = result.code

    if (sourceMapEnabled) {
      resultCode += '\n//# sourceMappingURL=mega.' + format + '.js.map'
      fs.writeFile('dist/mega.' + format + '.js.map', result.map.toString(), function (err) {
        if (err) throw err
      })
    }

    fs.writeFile('dist/main.' + format + '.js', resultCode, function (err) {
      if (err) throw err
    })
  }, function (error) {
    console.error(error.stack || error)
    throw error
  })
})
