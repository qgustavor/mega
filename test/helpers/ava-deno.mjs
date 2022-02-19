// Ava compatibility layer for Deno
/* global Deno */

import { assert, assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.122.0/testing/asserts.ts'
import { Buffer } from 'https://cdn.deno.land/std/versions/0.122.0/raw/node/buffer.ts'

const testContext = {
  assert,
  is: assertStrictEquals,
  deepEqual: assertEquals,
  throws: (fn, condition) => {
    return assertThrows(fn, condition.instanceof, condition.message)
  }
}

function test (name, fn, denoOpts = {}) {
  Deno.test({
    name,
    fn: () => fn(testContext),
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

window.Buffer = Buffer
export default test
