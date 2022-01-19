const alias = require('esbuild-plugin-alias')
const packageJson = require('./package.json')
const esbuild = require('esbuild')
const fs = require('fs')

// to aid debugging
const sourceMapEnabled = process.argv.includes('--generate-sourcemap')
const formatFilters = process.argv.filter(e => e.startsWith('--only=')).map(e => e.substr(7))

const formats = [{
  // to be loaded with <script>
  name: 'browser-umd',
  bundleExternals: true,
  minifyResult: true,
  entryPoints: ['lib/mega.js'],
  bundleFormat: 'iife',
  globalName: 'mega',
  platform: 'browser',
  targets: { browsers: 'defaults' }
}, {
  // to be loaded with ES Module compatible loader
  name: 'browser-es',
  bundleExternals: true,
  minifyResult: true,
  entryPoints: ['lib/mega-es.js'],
  bundleFormat: 'esm',
  platform: 'browser',
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
  minifyResult: false,
  entryPoints: ['lib/mega.js'],
  bundleFormat: 'cjs',
  platform: 'node'
}, {
  // to be loaded with ES Module compatible loader
  name: 'node-es',
  bundleExternals: false,
  minifyResult: false,
  entryPoints: ['lib/mega-es.js'],
  bundleFormat: 'esm',
  platform: 'node'
}]

async function doBundle (format) {
  const result = await esbuild.build({
    entryPoints: format.entryPoints,
    bundle: true,
    define: {
      'process.env.IS_BROWSER_BUILD': JSON.stringify(format.name.includes('browser')),
      'process.env.PACKAGE_VERSION': JSON.stringify(packageJson.version)
    },
    format: format.bundleFormat,
    globalName: format.globalName,
    minify: format.minifyResult,
    platform: format.platform,
    sourcemap: sourceMapEnabled && 'inline',
    inject: format.bundleExternals
      ? ['./browser/process-shim.js']
      : [],
    external: format.bundleExternals
      ? []
      : [
          'abort-controller',
          'agentkeepalive',
          'combined-stream',
          'node-fetch',
          'crypto',
          'events',
          'secure-random',
          'stream',
          'stream-combiner',
          'stream-skip',
          'through'
        ],
    plugins: !format.bundleExternals
      ? []
      : [alias({
          http: require.resolve('./browser/noop.js'),
          https: require.resolve('./browser/noop.js'),
          'node-fetch': require.resolve('./browser/fetch.js'),
          './crypto/rsa': require.resolve('./browser/rsa.js'),
          './aes': require.resolve('./browser/aes.js'),
          stream: require.resolve('readable-stream/readable-browser.js')
        })],
    write: false
  })

  return fs.promises.writeFile('dist/main.' + format.name + '.js', result.outputFiles[0].contents)
}

async function doBuild () {
  console.error('Starting build...')
  console.error('Building 0 of %d', formats.length)

  for (let index = 0; index < formats.length; index++) {
    const format = formats[index]
    if (formatFilters.length > 0 && !formatFilters.includes(format.name)) continue

    // return the previous line (A), then to the first character (G), clean the line (2K) and print state
    console.log('\x1b[A\x1b[G\x1b[2KBuilding %d of %d: %s', index + 1, formats.length, format.name)

    await doBundle(format)
  }

  console.log('Build completed with success')
}

function handleBuildErrors (error) {
  console.error(error.stack || error)
  process.exit(1)
}

// Init build
doBuild().catch(handleBuildErrors)
