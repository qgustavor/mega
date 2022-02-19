export { Buffer } from 'buffer'
export const process = {
  env: {},
  nextTick: (fn, ...argv) => {
    globalThis.setTimeout(fn, 0, ...argv)
  }
}
export const global = globalThis
