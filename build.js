const alias = require('esbuild-plugin-alias')
const packageJson = require('./package.json')
const esbuild = require('esbuild')
const fs = require('fs')

const developmentMode = process.argv.includes('--dev')
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
  entryPoints: ['lib/mega.mjs'],
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
  entryPoints: ['lib/mega.mjs'],
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
    minify: !developmentMode && format.minifyResult,
    platform: format.platform,
    sourcemap: developmentMode && 'inline',
    inject: format.bundleExternals
      ? ['./browser/process-shim.mjs']
      : [],
    external: format.bundleExternals
      ? []
      : [
          'abort-controller',
          'agentkeepalive',
          'multistream',
          'node-fetch',
          'crypto',
          'events',
          'secure-random',
          'stream',
          'pumpify',
          'stream-skip',
          'through'
        ],
    plugins: !format.bundleExternals
      ? []
      : [alias({
          http: require.resolve('./browser/noop.mjs'),
          https: require.resolve('./browser/noop.mjs'),
          'abort-controller': require.resolve('./browser/noop.mjs'),
          'node-fetch': require.resolve('./browser/fetch.mjs'),
          './crypto/rsa.mjs': require.resolve('./browser/rsa.mjs'),
          './aes.mjs': require.resolve('./browser/aes.mjs'),
          stream: require.resolve('readable-stream/readable-browser.js')
        })],
    write: false
  })

  const ext = format.bundleFormat === 'esm' ? 'mjs' : 'js'
  return fs.promises.writeFile('dist/main.' + format.name + '.' + ext, result.outputFiles[0].contents)
}

async function doBuild () {
  console.error('Starting', developmentMode ? 'development' : 'production', 'build...')
  console.error('Building 0 of %d', formats.length)

  // Make dist folder if not exists
  await fs.promises.mkdir('dist').catch(error => {
    if (error.code !== 'EEXIST') throw error
  })

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
