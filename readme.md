# MEGAJS

Unofficial JavaScript SDK for MEGA

* This is based on [tonistiigi's mega library](https://github.com/tonistiigi/mega).
* This is all unofficial, based on [developer guide](https://mega.nz/#developers) and site source.
* Make sure you agree with MEGA's [Terms of Service](https://mega.nz/#terms) before using it.
* Maybe an official SDK will probably be released in the future here: https://github.com/meganz/

## Installation

```shell
npm install megajs
```

```javascript
const mega = require('megajs') // or
import mega from 'megajs'
```

You can also load it in a browser using `<script src="https://unpkg.com/megajs/dist/main.node-cjs.js"></script>`, which exports the library in the `mega` global variable. You can also use `import * as mega from 'https://unpkg.com/megajs/dist/main.browser-es.js'`.

**For more details, API documentation and examples check wiki: https://github.com/qgustavor/mega/wiki**

The bundled files are available via [npm](https://www.npmjs.com/package/megajs) and [UNPKG](https://unpkg.com/megajs/dist/).

**For CLI usage check MEGAJS CLI**: https://github.com/qgustavor/megajs-cli

## Implementation notes

Only part of the file related API is implemented. For now implementing contact and chat functions seems out of scope.

Cryptography is mostly ported from browser code. In Node some parts are optimized: AES operations are done using native crypto. Sadly WebCrypto don't support streaming so in browser the old pure JavaScript implementation is used. The RSA operations aren't optimized as currently there isn't any need to improve that.

This module works in the browser: the "main.browser-umd.js" is a build using the UMD format where Node specific modules, like crypto and request modules, were replaced with browser equivalents. If you want to use tree shaking then use the "main.browser-es.js" bundle. This module wasn't tested in other environments.

## Fork objectives

This package started as a fork, with the following objectives:

* Make the original package work in browsers again: even following [the instructions from the original library](https://github.com/tonistiigi/mega#browser-support) it stopped working because some dependencies used `__proto__`, which is non-standard and isn't supported in many browsers. Also the updated versions of those libraries broke backyards compatibility;
* Reduce dependencies and replace big dependencies with smaller ones, like crypto libraries, which usually are huge;
* Rewrite code using the new JavaScript syntax, allowing to use [Rollup](http://rollupjs.org/), which can generate smaller bundles;
* Make tests work again after the changes above;
* Continue the original library development implementing new features and improving performance.

Request package was replaced with a shim based in [browser-request](https://www.npmjs.com/package/browser-request) and [xhr-stream](https://www.npmjs.com/package/xhr-stream), which additional changes in order to make it work inside Service Workers. Crypto was replaced with [secure-random](https://www.npmjs.com/package/secure-random).

As there were many changes there isn't any plan to merge those changes into the original library, unless the original author accept those massive changes. That's why I put "js" in the name, which is silly because both libraries use JavaScript. At least it's better than other ideas I had, like "mega2", "mega-es" and "modern-mega".

## Contributing

When contributing fork the project, clone it, run `npm install`, change the library as you want, run tests using `npm run test` and build the bundled versions using `npm run build`. Before creating a pull request, *please*, run tests.
