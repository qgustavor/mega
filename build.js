const rollup = require('rollup')
const babel = require('rollup-plugin-babel')
const builtins = require('rollup-plugin-node-builtins')
const commonjs = require('rollup-plugin-commonjs')
const globals = require('rollup-plugin-node-globals')
const json = require('rollup-plugin-json')
const nodeResolve = require('rollup-plugin-node-resolve')
const replace = require('rollup-plugin-replace')
const compile = require('google-closure-compiler-js').compile
const babelTransform = require('babel-core').transform

const fs = require('fs')

// to aid debugging
const sourceMapEnabled = process.argv.includes('--generate-sourcemap')

const formats = [{
  // to be loaded with <script>
  bundleExternals: true,
  bundlePolyfills: true,
  minifyResult: true,
  entryPoint: 'lib/mega.js',
  bundleConfig: { name: 'browser-umd', format: 'umd', moduleName: 'mega' }
}, {
  // to be loaded with ES Module compatible loader
  bundleExternals: true,
  bundlePolyfills: true,
  minifyResult: true,
  entryPoint: 'lib/mega-es.js',
  bundleConfig: { name: 'browser-es', format: 'es' }
}, {
  // to allow the old commonjs usage
  bundleExternals: false,
  bundlePolyfills: false,
  minifyResult: false,
  entryPoint: 'lib/mega.js',
  bundleConfig: { name: 'node-cjs', format: 'cjs' }
}, {
  // to be loaded with ES Module compatible loader
  bundleExternals: false,
  bundlePolyfills: false,
  minifyResult: false,
  entryPoint: 'lib/mega-es.js',
  bundleConfig: { name: 'node-es', format: 'es' }
}]

const warnings = []
const handleWarning = (warning) => {
  warnings.push(warning)
}

const doBundle = (format) => {
  const externalConfig = format.bundleExternals ? [] : [
    'zlib', 'https', 'http', 'crypto', 'fs', 'tls',
    'net', 'string_decoder', 'assert', 'punycode',
    'dns', 'dgram', 'request', 'combined-stream',
    'url', 'through', 'stream-combiner', 'events',
    'secure-random', 'querystring', 'stream'
  ]

  return rollup.rollup({
    entry: format.entryPoint,
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
      format.bundleExternals && builtins(),
      format.bundleExternals && globals(),
      replace({ values: {
        'IS_BROWSER_BUILD': '' + format.bundleConfig.name.includes('browser')
      }}),
      format.bundlePolyfills && replace({ values: {
        "from 'request'": "from '../browser/request.js'",
        "from './crypto/rsa'": "from '../browser/rsa.js'",
        "from './aes'": "from '../../browser/aes.js'"
      }}),
      format.bundleExternals && nodeResolve({
        jsnext: true,
        main: true,
        browser: true
      }),
      json(),
      babel({
        exclude: 'node_modules/**'
      })
    ]
  }).then((bundle) => {
    const options = format.bundleConfig
    const result = bundle.generate(Object.assign({
      sourceMap: sourceMapEnabled && 'inline'
    }, options))

    if (format.minifyResult) {
      if (options.format === 'es') {
        // Minify Browser ES modules using babili (Closure don't support ES6 to ES6)
        result.code = babelTransform(result.code, {
          babelrc: false,
          presets: [['babili', {
            mangle: {
              // Usually minifiers don't minify top level because it's the global scope on browsers
              // But it don't applies to ES6 modules
              topLevel: true
            }
          }]]
        }).code
      } else {
        // Minify Browser UMD modules using Closure Compiler
        result.code = compile({
          rewritePolyfills: false,
          jsCode: [{src: result.code}]
        }).compiledCode
      }
    }

    return writeFilePromise('dist/main.' + options.name + '.js', result.code)
  })
}

console.error('Starting build...')
console.error('Building 0 of %d', formats.length)

formats.reduce((last, format, index) => last.then(() => {
  // return the previous line (A), then to the first character (G), clean the line (2K) and print state
  console.log('\x1b[A\x1b[G\x1b[2KBuilding %d of %d', index + 1, formats.length)

  return doBundle(format)
}), Promise.resolve())
.then(() => {
  if (warnings.length) {
    console.log('Build completed with warnings')
    console.log(Array.from(new Set(warnings)).join('\n'))
    process.exit(1)
  }

  console.log('Build completed with success')
})
.catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})

function writeFilePromise (...argv) {
  return new Promise((resolve, reject) => {
    fs.writeFile(...argv, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
