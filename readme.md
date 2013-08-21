[![Build Status](https://secure.travis-ci.org/tonistiigi/mega.png)](http://travis-ci.org/tonistiigi/mega)

## Read first

- This is all unofficial, based on [developer guide](https://mega.co.nz/#developers) and site source.
- Official SDK will probably be released in the future. You may want to wait.
- Only part of the API is implemented.
- Crypto is mostly ported from browser code and isn't optimal. Probably some of it could be done with openssl, [ursa](https://github.com/Obvious/ursa) or [cryptojs](https://github.com/gwjjeff/cryptojs.git) or the algorithms could at least be ported to use Buffer format, but this is no way a priority.
- If you use it for something make sure you agree with Mega's [Terms of Service](https://mega.co.nz/#terms).


## Installation

```
npm install mega
```

```
var mega = require('mega')
```

See examples directory for quick start.

## Missing functionality

- No sharing features
- Missing file management: move, mkdir, symlink etc.

## Browser support

This module also works in the browser with [browserify](https://github.com/substack/node-browserify). Not all patches have landed yet so you should use [this fork](https://github.com/tonistiigi/node-browserify) and `request@2.10.0`. See [demo page](http://tonistiigi.github.com/mega/) for preview.

## API

### var storage = mega([options], [readyCallback])

Create new connection instance to Mega.

**Supported options:**

`email` - User login email.

`password` - User password.

`keepalive` - Keep connection open to receive server-to-client requests that will be mapped to events. Defaults to true.

`autoload` - Load in file structure. Defaults to true.


If you don't specify email/password then temporary account will be created. Once connection closes for temporary account you cannot access same account again so you need to save a link to file. Temporary accounts regularly get deleted.

**After `readyCallback()` or `ready` event fires storage has following properties:**

`name` - Account owner name

`key` - Account master key

`rsaPrivateKey` - RSA private Key

`sid` - Current session ID

`files` - Hash of `File` objects by node ID-s.

`root` - `File` object for Cloud Drive main directory

`trash` - `File` object for Rubbish bin

`inbox` - `File` object for Inbox

`mounts` - Array of all top level directories

### storage.upload(options | name, [buffer], [cb])

```
fs.createReadStream('myfile.txt').pipe(storage.upload('myfile.txt'))
```

Upload a file to Mega. You can pass in buffer data or just pipe data into it. Callback returns uploaded file object. If you don't specify callback you can listen for `complete` event to get the file handle.

**Supported options:**

`name` - File name *required*

`attributes` - Object of file attributes.

`size` - File size. Note that because Mega's API needs final data length before uploading can start, streaming only fully works if you specify the size of your data. Otherwise it needs to first buffer your data to determine the size.

`target` - Target directory file object or node ID. Defaults to `storage.root`.


### storage.mkdir(options | name, cb)

```
storage.mkdir('dirname', function(err, file) {
})
```

**Supported options:**

`name` - Directory name *required*

`attributes` - Object of file attributes.

`target` - Parent directory file object or node ID. Defaults to `storage.root`.



### storage.reload(cb)

Reloads files tree. No need to call this if `autoload` is used.


### Events:

These events fire on file changes when `keepalive` is used. The changes can be triggered from any session connected to the same account.

`add` - New file/dir was added. Parameters: file.

`move` - File was moved to another dir. Parameters: file, olddir.

`delete` - File was deleted. Parameters: file.

`update` - File was changed(renamed). Parameters: file.


### mega.file(url | opt)

```
var file = mega.file('https://mega....')
```

Returns file object based on download URL or options. Options can be `downloadId` and `key`.

### File

**Properties:**

`name` - File name

`attributes` - Object of attributes

`size` - File size

`key` - File key(buffer)

`timestamp` - File creation time

`nodeId` - File ID

`downloadId` - Link ID to file. Only if created from link.

`directory` - Boolean if file is directory.

`children` - Array of files for directories.

### file.download([cb])

Read file contents.

```
file.download().pipe(fs.createWriteStream('myfile.txt'))

file.download(function(err, data) {
  // data is buffer
})
```

### file.link([noKey], cb)

Make download link for a file.

```
file.link(function(err, url) {
  // url: https://mega.co.nz/#!downloadId!key
})
```

### file.delete(cb)

Delete file permanently.

```
file.delete(function(err) {
  // deleted.
})
```

### file.loadAttributes(cb)

Download and decrypt file attributes. Attributes normally contain file name("n"), but it seems you can put anything you want in there.

Only makes sense when file is created from download link with `mega.file(url)`, otherwise attributes are already loaded/decrypted.

```
mega.file(url).loadAttributes(function(err, file) {
  // file.name
  // file.size
  // file.attributes
})
```


### Events:

Same events as for Storage objects. Only trigger for a specific file.

`move` - File was moved to another dir. Parameters: olddir.

`delete` - File was deleted.

`update` - File was changed(renamed).


### mega.encrypt([key]) / mega.decrypt(key)

Lower level duplex streams. These could be used if you want to do network traffic and crypto on different time.

Takes in encrypted file data and outputs decrypted data and vice versa. Also does MAC verification / generation.

Note that if you specify key for `encrypt()` it needs to be 192bit. Other 64bit are for the MAC. You can later read the full key from the `key` property of the stream.