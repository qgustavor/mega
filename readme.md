*[Read fork info below.](#fork-info)*

## Read first

- This is all unofficial, based on [developer guide](https://mega.nz/#developers) and site source.
- Official SDK will probably be released in the future. You may want to wait for it here: https://github.com/meganz/
- Only part of the API is implemented.
- Crypto is mostly ported from browser code and isn't optimal. [Related issue](https://github.com/qgustavor/mega/issues/3).
- If you use it for something make sure you agree with MEGA's [Terms of Service](https://mega.nz/#terms).


## Installation

```shell
npm install qgustavor/mega
```

```javascript
var mega = require('mega')
```

See examples directory for quick start.

## Missing functionality

- Can open shared folders and files, but can't share those.
- Missing file management: move, symlink etc.

## Browser support

This module works in the browser via browserify, webpack, rollup and similar module bundlers. For some of those build maybe some configuration for
node globals and native packages is needed. There is also a browser specific build in `/dist` folder. This version is the one used in the fallback
mode of https://directme.ga.

## API

### var storage = mega([options], [callback])

Create new connection instance to MEGA.

**Supported options:**

* `email` - User login email.
* `password` - User password.
* `keepalive` - Keep connection open to receive server-to-client requests that will be mapped to events. Defaults to `true`.
* `autoload` - Load in file structure. Defaults to `true`.

If you don't specify email/password then temporary account will be created. Once connection closes for temporary account you cannot access same account again so you need to save a link to file. Temporary accounts regularly get deleted.

**After `readyCallback()` or `ready` event fires storage has following properties:**

* `name` - Account owner name
* `key` - Account master key
* `rsaPrivateKey` - RSA private Key
* `sid` - Current session ID
* `files` - Hash of `File` objects by node ID-s.
* `root` - `File` object for Cloud Drive main directory
* `trash` - `File` object for Rubbish bin
* `inbox` - `File` object for Inbox
* `mounts` - Array of all top level directories

### storage.upload(options | name, [buffer], [callback])

```javascript
fs.createReadStream('myfile.txt').pipe(storage.upload('myfile.txt'))
```

Upload a file to MEGA. You can pass in buffer data or just pipe data into it. Callback returns uploaded file object. If you don't specify callback you can listen for `complete` event to get the file handle.

**Supported options:**

* `name` - File name *required*
* `attributes` - Object of file attributes.
* `size` - File size. Note that because MEGA's API needs final data length before uploading can start, streaming only fully works if you specify the size of your data. Otherwise it needs to first buffer your data to determine the size.
* `target` - Target directory file object or node ID. Defaults to `storage.root`.

### storage.mkdir(options | name, callback)

```javascript
storage.mkdir('dirname', (err, file) => { ... })
```

**Supported options:**

* `name` - Directory name *required*
* `attributes` - Object of file attributes.
* `target` - Parent directory file object or node ID. Defaults to `storage.root`.

### storage.reload(cb)

Reloads files tree. No need to call this if `autoload` is used.

### Events:

These events fire on file changes when `keepalive` is used. The changes can be triggered from any session connected to the same account.

* `add` - New file/dir was added. Parameters: file.
* `move` - File was moved to another dir. Parameters: file, olddir.
* `delete` - File was deleted. Parameters: file.
* `update` - File was changed(renamed). Parameters: file.

### mega.file(url | options)

```javascript
var file = mega.file('https://mega.nz/#!...')
var folder = mega.file('https://mega.nz/#F!...')
```

Returns file object based on download URL or an options object containing `downloadId` (string), `key` (optional, string or buffer)
and `directory` (boolean, `true` if is a shared folder).

Please note: as MEGA security model allows access to file and folder metadata without needing encryption keys this library
also don't requires it. Also, downloading files don't work if the encryption key isn't provided.

### File

Can be a file or folder.

**Properties:**

* `name` - File name✝
* `attributes` - Object of attributes✝
* `size` - File size
* `key` - File key(buffer)✝
* `timestamp` - File creation time
* `nodeId` - File ID
* `downloadId` - Link ID to file. Only if created from link.
* `directory` - Boolean if file is directory.
* `children` - Array of files for directories.

✝ Those values are null or undefined when an encryption key isn't specified.

### file.download([options], [callback])

Read file contents.

```javascript
file.download().pipe(fs.createWriteStream('myfile.txt'))

file.download((err, data) => {
  // data is buffer
})
```

This function downloads files using multiple parallel connections to speed up downloading.
The number of parallel connections is defined by `maxConnections` (default: 4). In order
to do that it downloads files in chunks, with a size starting with `initialChunkSize`
(default: 128KB) and increasing by `chunkSizeIncrement` (default: 128KB) until it reaches a
`maxChunkSize` (max 1MB).

Those values can be overwriten by using the `options` object, with sizes specified in bytes.

### file.link([noKey], callback)

Make download link for a file.

```javascript
file.link((err, url) => {
  // url: https://mega.nz/#!downloadId!key
})
```

### file.delete(callback)

Delete file permanently.

```javascript
file.delete((err) => {
  // deleted.
})
```

### file.loadAttributes(callback)

Download and decrypt file attributes. Attributes normally contain file name (`'n'`) but is possible to put anything there, as long it can be encoded as JSON.

Only makes sense when file is created from download link with `mega.file(url)`, otherwise attributes are already loaded/decrypted.

```javascript
mega.file(url).loadAttributes((err, file) => {
  // file.name
  // file.size
  // file.attributes
})
```

This function can be also be used to load file information contained in shared folders, as seem below:

```javascript
const folder = mega.file('https://mega.nz/#F!...').loadAttributes((err, folder) => {
  if (err) throw err
  // Folder name is `folder.name`
  // Files are in the `folder.children` array
  const file = folder.children[0]
  file.download().pipe(fs.createWriteStream(file.name))
})
```

### Events:

Same events as for Storage objects. Only trigger for a specific file.

* `move` - File was moved to another dir. Parameters: olddir.
* `delete` - File was deleted.
* `update` - File was changed(renamed).

### mega.encrypt([key]) / mega.decrypt(key)

Lower level duplex streams. These could be used if you want to do network traffic and crypto on different time.

Takes in encrypted file data and outputs decrypted data and vice versa. Also does MAC verification / generation.

Note that if you specify key for `encrypt()` it needs to be 192bit. Other 64bit are for the MAC. You can later read the full key from
the `key` property of the stream.

## Fork info:

This fork intents to:

* Make the original package work in browsers again, because, even following
[the instructions from the original library](https://github.com/tonistiigi/mega#browser-support),
it stopped working because some dependencies used `__proto__`, which is non-standard and isn't
supported in many browsers, and the updated versions of those libraries broke backyards compatibility;
* Reduce dependencies and replace big dependencies with smaller ones;
* Rewrite code using the new JavaScript syntax, allowing to use rollup;
* Make tests work again after the changes above;
* Continue the original library development implementing new features and improving performance.

Request package can't be browserified well using rollup, so it was replaced with a shim based in
[browser-request](https://www.npmjs.com/package/browser-request) and
[xhr-stream](https://www.npmjs.com/package/xhr-stream), which additional changes in order to make
it work inside Service Workers, which in current Chrome Canary don't support XMLHttpRequest, just
fetch. Crypto dependency was replaced with [secure-random](https://www.npmjs.com/package/secure-random)
as node crypto was only used for key generation.

*Please note:* as this library is a work in progress sometimes things may break, most because we still
don't created any real test cases. Please don't use any undocumented functions as those can be removed
or replaced any time (example: `File.getCiphers` was moved to `crypto.getCiphers` because don't makes
sense a cryptographic function belonging to the file constructor).
