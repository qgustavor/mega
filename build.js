var fs = require('fs')
var rollup = require('rollup')
var npm = require('rollup-plugin-npm')
var babel = require('rollup-plugin-babel')
var inject = require('rollup-plugin-inject')
var commonjs = require('rollup-plugin-commonjs')
var sourceMapEnabled = false

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
  var result = bundle.generate({
    format: 'iife',
    sourceMap: sourceMapEnabled
  })

  var resultCode = result.code
  if (sourceMapEnabled) {
    resultCode += '\n//# sourceMappingURL=main.js.map'
    fs.writeFile('dist/main.js.map', result.map.toString(), function (err) {
      if (err) throw err
    })
  }

  fs.writeFile('dist/main.js', resultCode, function (err) {
    if (err) throw err
  })
})
