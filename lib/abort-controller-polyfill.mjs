import abortControllerPolyfill from 'abort-controller'
const abortController = globalThis.AbortController || abortControllerPolyfill
export default abortController
