
# Release v1.3.0

### Minor Changes

#### [Remove node-fetch (@qgustavor)](https://github.com/qgustavor/mega/pull/196)

node-fetch is no longer going to be included with the library since all currently supported Node.js versions include a `fetch` global.
   
### Patch Changes

#### [Fix issue on handleForceHttps implementation. (@qgustavor)](https://github.com/qgustavor/mega/pull/199)

I was certain I tested this! :expressionless:
#### [Create config.yml (@qgustavor)](https://github.com/qgustavor/mega/pull/198)


#### [Add checks for Firefox and Deno (@qgustavor)](https://github.com/qgustavor/mega/pull/197)

Add checks for Firefox and Deno so having to set `userAgent: null` or `forceHttps: false` is no longer required.
#### [Bump braces from 3.0.2 to 3.0.3 (@dependabot[bot])](https://github.com/qgustavor/mega/pull/194)

Bumps [braces](https://github.com/micromatch/braces) from 3.0.2 to 3.0.3.

# Release v1.2.1

### Patch Changes

#### [Fix repository URL (@qgustavor)](https://github.com/qgustavor/mega/pull/190)


#### [Fix GitHub Actions (@qgustavor)](https://github.com/qgustavor/mega/pull/189)

Use always the last Node version.  Update action packages.
#### [Fix package.json's exports (@qgustavor)](https://github.com/qgustavor/mega/pull/188)


#### [Simplify the readme warning message (@qgustavor)](https://github.com/qgustavor/mega/pull/186)

I hope that makes people read it.

# Release v1.2.0

### Minor Changes

#### [Find and fetch (@qgustavor)](https://github.com/qgustavor/mega/pull/183)

Implement find, search and navigate functions, and fix fetch related issues.
   
### Patch Changes

#### [Add test for providing a stream as an input (@qgustavor)](https://github.com/qgustavor/mega/pull/181)

No, that's not because of the guy who doesn't read things, that's because I noticed there was not a test for that.

# Release v1.1.8

### Patch Changes

#### [Update Node.js versions in test runner (@qgustavor)](https://github.com/qgustavor/mega/pull/179)


#### [bump node-fetch version to 3.3.2 (@franklygeorgy)](https://github.com/qgustavor/mega/pull/178)

`punycode` is deprecated.  Bumped node-fetch version to a newer version that doesn't depend on `punycode`.
#### [Export MutableFile (@super-v-2038)](https://github.com/qgustavor/mega/pull/176)

Thank you for your work! This package has saved me a lot of time.  It seems that `MutableFile` has not been exported, which may be an oversight.

# Release v1.1.7

### Patch Changes

#### [Fix upload progress (@qgustavor)](https://github.com/qgustavor/mega/pull/173)

bytesUploaded was defined inside sendChunk, not inside _uploadWithSize.

# Release v1.1.6

### Patch Changes

#### [Fix Angular link (@qgustavor)](https://github.com/qgustavor/mega/pull/171)

The old link was for old Angular, not modern Angular.
#### [Handle upload progress better and don't minify browser-es (@qgustavor)](https://github.com/qgustavor/mega/pull/170)

Upload progress can be monitored by checking progress events.
#### [Update readme.md (@qgustavor)](https://github.com/qgustavor/mega/pull/168)

# Release v1.1.5

### Patch Changes

#### [Fix Angular link (@qgustavor)](https://github.com/qgustavor/mega/pull/171)

The old link was for old Angular, not modern Angular.
#### [Handle upload progress better and don't minify browser-es (@qgustavor)](https://github.com/qgustavor/mega/pull/170)

Upload progress can be monitored by checking progress events.
#### [Update readme.md (@qgustavor)](https://github.com/qgustavor/mega/pull/168)

# Release v1.1.4

### Patch Changes

#### [Create LICENSE (@qgustavor)](https://github.com/qgustavor/mega/pull/166)


#### [Bump word-wrap from 1.2.3 to 1.2.4 (@dependabot[bot])](https://github.com/qgustavor/mega/pull/159)

Bumps [word-wrap](https://github.com/jonschlinkert/word-wrap) from 1.2.3 to 1.2.4.  Release notes.  Sourced from word-wrap's releases.  1.2.4.  What's Changed.
#### [Fix typo in workflow (@qgustavor)](https://github.com/qgustavor/mega/pull/156)


#### [Give permission to mint an ID-token so provenance works (@qgustavor)](https://github.com/qgustavor/mega/pull/155)

:facepalm:
