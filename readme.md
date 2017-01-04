*[Read fork info below.](#fork-info)*

## Read first

- This is all unofficial, based on [developer guide](https://mega.nz/#developers) and site source.
- An official SDK will probably be released in the future. You may want to wait for it here: https://github.com/meganz/
- Only part of the file handling API is implemented.
- Crypto is mostly ported from browser code, but in Node are optimized: AES operations are done using native crypto. Sadly WebCrypto don't support streaming so in browser the old pure JavaScript implementation is used. The RSA operations aren't optimized as currently there isn't any need to improve that.
- Make sure you agree with MEGA's [Terms of Service](https://mega.nz/#terms) before using it.

## Installation

```shell
npm install qgustavor/mega
```

```javascript
var mega = require('mega') // or
import mega from 'mega' // or what you use in your module loader
```

**For API documentation and examples check documentation: https://qgustavor.github.io/mega/**

## Browser support

This module works in the browser: the "dist/main.browser.js" is a build using the UMD format where Node specific modules, like crypto and request modules, were replaced with browser equivalents.

If you're using a module loader you may find some problems loading "dist/main.cjs.js" and "dist/main.es.js" because you will need to handle the module replacement for yourself. If you have a better solution to this problem open an issue.

## Fork info:

This fork has the following objetives:

* Make the original package work in browsers again: even following [the instructions from the original library](https://github.com/tonistiigi/mega#browser-support) it stopped working because some dependencies used `__proto__`, which is non-standard and isn't supported in many browsers. Also the updated versions of those libraries broke backyards compatibility;
* Reduce dependencies and replace big dependencies with smaller ones, like crypto libraries, which usually are huge;
* Rewrite code using the new JavaScript syntax, allowing to use [Rollup](http://rollupjs.org/), which can generate smaller bundles;
* Make tests work again after the changes above;
* Continue the original library development implementing new features and improving performance.

As there were many changes there isn't any plan to merge those changes into the original library, unless the original author accept those massive changes.

Request package can't be browserified well using rollup, so it was replaced with a shim based in [browser-request](https://www.npmjs.com/package/browser-request) and [xhr-stream](https://www.npmjs.com/package/xhr-stream), which additional changes in order to make it work inside Service Workers, which in current Chrome Canary don't support XMLHttpRequest, just fetch. Crypto dependency was replaced with [secure-random](https://www.npmjs.com/package/secure-random) as node crypto was only used for key generation.

## Disclaimer:

As this library is a work in progress sometimes things may break, most because the code don't have a good coverage. Please don't use any undocumented functions as those can be removed or replaced any time. Example: `File.getCiphers` was moved to `crypto.getCiphers` because don't makes sense a cryptographic function belonging to the file constructor.
