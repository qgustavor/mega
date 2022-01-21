// Ava compatibility layer for Deno
import { assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/x/power_assert_deno@0.1.0/mod.ts'
import { Buffer } from 'https://cdn.deno.land/std/versions/0.122.0/raw/node/buffer.ts'

const testContext = {
  is: assertStrictEquals,
  deepEqual: assertEquals,
  throws: (fn, condition) => {
    return assertThrows(fn, condition.instanceof, condition.message)
  }
}

function test (name, fn) {
  Deno.test(name, () => fn(testContext))
}

// Does nothing: Deno always runs tests in serial
test.serial = test

test.skip = test.serial.skip = name => {
  Deno.test(name, () => {
    console.warn('Test', name, 'was skipped')
  })
}

window.Buffer = Buffer
export default test
