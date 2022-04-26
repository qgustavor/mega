// This script handles test preparation, running in Node and Deno then cleanup
import alias from 'esbuild-plugin-alias'
import { fileURLToPath } from 'node:url'
import cp from 'node:child_process'
import fs from 'node:fs/promises'
import megamock from 'mega-mock'
import crypto from 'node:crypto'
import esbuild from 'esbuild'
import tmp from 'tmp-promise'
import path from 'node:path'
import os from 'node:os'

let testedPlatform = process.argv[2]
if (testedPlatform !== 'node' && testedPlatform !== 'deno') {
  console.warn(`Unknown platform: ${testedPlatform}.`)
  console.warn('This is a multi-platform project and because CI the test command needs to know what platform is being tested.')
  console.warn('Assuming "node". Next time run "npm test node" or "npm test deno".')
  testedPlatform = 'node'
}

// Set up temporary directories
const tempDir = await tmp.dir({
  prefix: 'megajs-tests',
  unsafeCleanup: true
})
console.info('Tests will use this directory:', tempDir.path)

const serverDir = path.resolve(tempDir.path, 'server')
const buildDir = path.resolve(tempDir.path, 'build')
await fs.mkdir(serverDir)
await fs.mkdir(buildDir)

// Build tests
const packageJson = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url)))

const testFolder = new URL('..', import.meta.url)
const testFiles = (await fs.readdir(testFolder))
  .filter(e => e.includes('.test'))
  .map(e => fileURLToPath(new URL(e, testFolder.href)))

if (testedPlatform === 'node') {
  await esbuild.build({
    platform: 'node',
    entryPoints: testFiles,
    bundle: true,
    outdir: buildDir,
    format: 'esm',
    define: {
      'process.env.IS_BROWSER_BUILD': JSON.stringify(false),
      'process.env.PACKAGE_VERSION': JSON.stringify(packageJson.version)
    },
    external: [
      'ava',
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
    ]
  })
} else {
  // Only run tests on compiled code (integration tests?) on Deno by now
  // as probably the additional Node tests will not cover
  // issues not affected by cross-platform differences
  const denoTests = testFiles.filter(e => e.match(/(storage|crypto-stream|verify)\./))
  await esbuild.build({
    platform: 'browser',
    entryPoints: denoTests,
    bundle: true,
    outdir: buildDir,
    format: 'esm',
    define: {
      'process.env.IS_BROWSER_BUILD': JSON.stringify(true),
      'process.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
      'process.env.MEGA_MOCK_URL': JSON.stringify(null)
    },
    plugins: [alias({
      ava: fileURLToPath(new URL('ava-deno.mjs', import.meta.url)),
      './helpers/test-utils.mjs': fileURLToPath(new URL('test-utils-deno.mjs', import.meta.url)),
      '../dist/main.node-es.mjs': fileURLToPath(new URL('../../dist/main.browser-es.mjs', import.meta.url))
    })]
  })
}

// Set up mock server
const server = megamock({
  dataFolder: serverDir
})

// Mock data for "mock@test" as username and "mock" as password
server.state.loginData.set('jCf2Pc0pLCU', {
  csid: 'CACRPiCIZqylaYVkXvUxvE4XkQeJrwTonOWCikeZFTRPxu5R97xTMTRxNeWlY5keMSLoUACOceI6CHjDLILL-6mQYN37_El9Y5bgmcwJtSHN54au0igwkxxZw_lD7lliQ4uSvSSihQ_iKjj2SxFFmF4F8Sa2UCYQz1iLMDhejR7YAaGGggII5e8jYbtNPOiwwPYf-AFWB7IfOFFXmZ6tLzDJrbodbhAc6EVaiPZZ4QyT6fdKchQeDkjDZu_ygxU0DBQEco1X6SuekGfORsannkJsgAIIlp1Uz-ZdZrrbXoXhFDsCXsibUWJJjF4cPwHMtPSjzcyE_vd-ViFKQJcNDain',
  privk: 'AY5AYTQVUt772M3pLi9v7WNhUSYhvrGOnXuyePr4bOlOlckyomWizvB6xqqHGkx3cYXGWTM3QrAxHPFRNhnd47cG974nkGJyjv7NL6vnIGsmtuiMNpLrrkl9nS8itTZCluBWV7jPc6dRlFWNQ7uiT-Bc6d2mFiApd3xYJuNXFmgFo2_8z_1HQhXWOFJIlsESXc_oaxg0QNx8zE9pCdrKWTCw07VKCbAvJNnYGFdSnEjv3phBUkOd2snyK3LA-Kn9ehPgfcDmSfLaCJ_5y5IN18rHGQdRt_Dxs_CabKYgmF6rKMJ8BCfunuOso6Gx984fOvtbyrwxeL6z0QbqsvGe6H3GpoY6d5M0tnFoJz_PlY0EX5gW6Eo0ZGSJ1xcyMewqQt2JBtw-LuMojrwctHc7KchgLgbqqbJHnuRYrOCjkJeySwOHoUR1lP8qjmHUIlSPaRvughULPIoAs6suoRNBgHq_LEvuAFb9zA05El3Z98eKH6Sxstw_K-d7ZbV_k4osKEwCgDa0Y9vTfpcxt6iw0IqGBqkt6v1U8u4lXaiue_0CVbxhrTH4N5Ceyy7yLsyt8ju6hKRljZ5G9fKcB6rvp3h5WxDnLdJ1KTuZatcZI37uAnEBHNhJJoJE-xNIAWIgcfpffQ-BXlBaejTIyAY_zf0SjRnXIYd3PvBVwRFGKNN7Yp-eEiS3nFTvtBuGv8YK1488UJhj4-jLaQdnFRxB3wFoFdaIPdIJowtZkaYlViZ15cNxd70EK97dgUJm9AUJKQGfIopl0ucEtxNUjXn6ekscILk23LpVNE3kDROCxyIOPTGCPKPo-FZtMTQkZxW3vZ6pxjzmCzTm5Q13XmMtMDrEsgVb9jWC9sEMlHxIMLA',
  k: 'xMEmMmKm0AbbOf9nGPLgSA'
})

// Start the server
const gateway = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    resolve(`http://127.0.0.1:${port}/`)
  })
})

// Run tests
let wasFailed = false

// Run tests
if (testedPlatform === 'node') {
  await new Promise(resolve => {
    const subprocess = cp.spawn('npx', ['ava', '--', path.join(buildDir, '*.js')], {
      stdio: 'inherit',
      shell: os.platform() === 'win32',
      env: {
        ...process.env,
        MEGA_MOCK_URL: gateway
      }
    })

    subprocess.on('error', error => {
      console.error(error)
      wasFailed = true
      resolve()
    })

    subprocess.on('exit', code => {
      if (code === 0) return resolve()
      console.error('Node tests exited with code', code)
      wasFailed = true
      resolve()
    })
  })
} else {
  await new Promise(resolve => {
    const subprocess = cp.spawn('deno', ['test', '--allow-env=MEGA_MOCK_URL', '--allow-net=' + gateway.slice(7)], {
      cwd: buildDir,
      stdio: 'inherit',
      shell: os.platform() === 'win32',
      env: {
        ...process.env,
        MEGA_MOCK_URL: gateway
      }
    })

    subprocess.on('error', error => {
      console.error(error)
      wasFailed = true
      resolve()
    })

    subprocess.on('exit', code => {
      if (code === 0) return resolve()
      console.error('Deno tests exited with code', code)
      wasFailed = true
      resolve()
    })
  })
}

// Verify if server state is equal to expected server state after tests
if (!wasFailed) {
  const serverStateSerialized = JSON.stringify(server.state)
  const serverStateHash = crypto.createHash('blake2b512').update(serverStateSerialized).digest('hex').slice(0, 64)
  const expectedStateHash = 'f7f498beb8fd4b1175e65474c38b0cd54c2b4f57442ab964645e9459bf62d89b'

  if (serverStateHash !== expectedStateHash) {
    console.error('Got server state hash', serverStateHash)
    console.error('Expected', expectedStateHash)
    wasFailed = true
  }
}

await new Promise(resolve => server.close(resolve))
tempDir.cleanup()

// Exit with error code 1 if some test failed
if (wasFailed) process.exit(1)
