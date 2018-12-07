const rollup = require('rollup')
const babel = require('rollup-plugin-babel')
const builtins = require('rollup-plugin-node-builtins')
const commonjs = require('rollup-plugin-commonjs')
const globals = require('rollup-plugin-node-globals')
const json = require('rollup-plugin-json')
const nodeResolve = require('rollup-plugin-node-resolve')
const replace = require('rollup-plugin-replace')
const babelTransform = require('@babel/core').transform

const fs = require('fs')

// to aid debugging
const sourceMapEnabled = process.argv.includes('--generate-sourcemap')
const formatFilters = process.argv.filter(e => e.startsWith('--only=')).map(e => e.substr(7))

const formats = [{
  // to be loaded with <script>
  name: 'browser-umd',
  bundleExternals: true,
  bundlePolyfills: true,
  minifyResult: true,
  entryPoint: 'lib/mega.js',
  bundleConfig: { format: 'umd', name: 'mega' },
  targets: { browsers: 'defaults' }
}, {
  // to be loaded with ES Module compatible loader
  name: 'browser-es',
  bundleExternals: true,
  bundlePolyfills: true,
  minifyResult: true,
  entryPoint: 'lib/mega-es.js',
  bundleConfig: { format: 'es' },
  targets: {
    // Only browsers that support <script type="module"> are supported because
    // usually when ES modules are loaded in older browsers a transpiler is used.
    // Data from https://caniuse.com/#feat=es6-module
    browsers: [
      'Edge >= 16',
      'Firefox >= 60',
      'Chrome >= 64',
      'Safari >= 11'
    ]
  }
}, {
  // to allow the old commonjs usage
  name: 'node-cjs',
  bundleExternals: false,
  bundlePolyfills: false,
  minifyResult: false,
  entryPoint: 'lib/mega.js',
  bundleConfig: { format: 'cjs' },
  targets: { node: 6 }
}, {
  // to be loaded with ES Module compatible loader
  name: 'node-es',
  bundleExternals: false,
  bundlePolyfills: false,
  minifyResult: false,
  entryPoint: 'lib/mega-es.js',
  bundleConfig: { format: 'es' },
  targets: { node: 6 }
}]

const warnings = []
const handleWarning = (warning) => {
  // https://github.com/calvinmetcalf/rollup-plugin-node-builtins/issues/39#issuecomment-378276979
  if (warning.code === 'CIRCULAR_DEPENDENCY') return

  warnings.push(warning)
}

const doBundle = (format) => {
  const externalConfig = format.bundleExternals ? [] : [
    'zlib', 'https', 'http', 'crypto', 'fs', 'tls',
    'net', 'string_decoder', 'assert', 'punycode',
    'dns', 'dgram', 'request', 'combined-stream',
    'url', 'through', 'stream-combiner', 'events',
    'secure-random', 'querystring', 'stream',
    'stream-skip'
  ]

  return rollup.rollup({
    input: format.entryPoint,
    external: externalConfig,
    onwarn: handleWarning,
    plugins: [
      format.bundlePolyfills && replace({
        values: {
          "from 'request'": "from '../browser/request.js'",
          "from './crypto/rsa'": "from '../browser/rsa.js'",
          "from './aes'": "from '../../browser/aes.js'"
        },
        delimiters: ['', '']
      }),
      commonjs(),
      format.bundleExternals && builtins(),
      format.bundleExternals && globals(),
      replace({ values: {
        'process.env.IS_BROWSER_BUILD': '' + format.name.includes('browser')
      }}),
      format.bundleExternals && nodeResolve({
        jsnext: true,
        main: true,
        browser: true
      }),
      json(),
      babel({
        exclude: 'node_modules/**',
        // .babelrc is used only on tests
        babelrc: false,
        presets: [
          ['@babel/preset-env', {
            modules: false,
            targets: format.targets
          }]
        ]
      })
    ]
  }).then((bundle) => {
    const options = format.bundleConfig
    return bundle.generate(Object.assign({
      sourcemap: sourceMapEnabled && 'inline'
    }, options))
  }).then((result) => {
    const options = format.bundleConfig
    if (format.minifyResult) {
      // Minify using babel-minify
      result.code = babelTransform(result.code, {
        // Keep pure annotations on ES modules
        shouldPrintComment: options.format === 'es' ? comment => {
          return comment === '#__PURE__'
        } : undefined,
        babelrc: false,
        presets: [['minify', {
          mangle: {
            // Usually minifiers don't minify top level because it's the global scope on browsers
            // But it don't applies to ES6 modules
            topLevel: options.format === 'es'
          }
        }]]
      }).code
    }

    return writeFilePromise('dist/main.' + format.name + '.js', result.code)
  })
}

function doBuild () {
  console.error('Starting build...')
  console.error('Building 0 of %d', formats.length)

  return formats.reduce((last, format, index) => last.then(() => {
    // Filter formats if --only=format arguments were used
    if (formatFilters.length > 0 && !formatFilters.includes(format.name)) return

    // return the previous line (A), then to the first character (G), clean the line (2K) and print state
    console.log('\x1b[A\x1b[G\x1b[2KBuilding %d of %d: %s', index + 1, formats.length, format.name)

    return doBundle(format)
  }), Promise.resolve())
}

function afterBuilding () {
  if (warnings.length) {
    console.log('Build completed with warnings')
    console.log(Array.from(new Set(warnings)).join('\n'))
    process.exit(1)
  }

  console.log('Build completed with success')
}

function handleBuildErrors (error) {
  console.error(error.stack || error)
  process.exit(1)
}

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

// Init build
doBuild().then(afterBuilding).catch(handleBuildErrors)
