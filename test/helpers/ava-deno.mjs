// Ava compatibility layer for Deno
/* global Deno */

import { assert, assertEquals, assertStrictEquals, assertThrows } from 'jsr:@std/assert'
import { Buffer } from 'node:buffer'

const testContext = {
  assert,
  is: assertStrictEquals,
  deepEqual: assertEquals,
  falsy: value => assert(!value),
  throws: (fn, condition) => {
    return assertThrows(fn, condition.instanceof, condition.message)
  }
}

function test (name, fn, denoOpts = {}) {
  Deno.test({
    name,
    fn: () => fn(testContext),
    // Disable sanitizers as those throw up because of the shared Storage instance
    sanitizeResources: false,
    sanitizeOps: false,
    ...denoOpts
  })
}

// Does nothing: Deno by default runs tests in serial
test.serial = test

test.skip = test.serial.skip = (name, fn, denoOpts = {}) => {
  Deno.test({
    name,
    fn,
    ignore: true,
    ...denoOpts
  })
}

globalThis.Buffer = Buffer
export default test
