var fs = require('fs')
var rollup = require('rollup')
var npm = require('rollup-plugin-npm')
var babel = require('rollup-plugin-babel')
var inject = require('rollup-plugin-inject')
var commonjs = require('rollup-plugin-commonjs')
var sourceMapEnabled = false // todo: use a command line argument to enable?

var formats = {
  browser: {
    moduleName: 'mega',
    format: 'umd'
  },
  cjs: { format: 'cjs' },
  es6: { format: 'es6' }
};

rollup.rollup({
  entry: 'lib/mega.js',
  plugins: [
    npm({
      jsnext: true,
      main: true,
      browser: true,
      alias: {
        'stream': 'stream-browserify',
        'crypto': 'crypto-browserify'
      }
    }),
    commonjs({
      namedExports: {
        'events': ['EventEmitter']
      }
    }),
    inject({
      'process': 'process',
      'Buffer': ['buffer', 'Buffer']
    }),
    babel()
  ]
}).then(function (bundle) {
  Object.keys(formats).forEach(function (format) {
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
  })
}, function (error) {
  console.error(error.stack || error)
  throw error
})
