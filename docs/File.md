# File

A `File` allow accessing **shared** MEGA files and folders.

## Basic syntax:

```javascript
// CommonJS
const mega = require('mega')
let file = mega.file(url | options)
let file = mega.File(options)

// ES Modules
import { File } from 'mega'
let file = File.fromURL(url | options)
let file = new File(options)
```

## Supported options:

If a string is passed it needs to be a shared MEGA url. It can be a `https://mega.co.nz` or a `https://mega.nz` file.

If an object is passed it needs to have the options below:

* `downloadId`: `https://mega.nz/#!THIS_PART!...` of the share link; a string
* `key`: `https://mega.nz/#!...!THIS_PART` of the share link; string or a Buffer; optional
* `directory`: `true` if loading a shared folder

## Properties:

* `name` - File name✝
* `attributes` - Object of attributes✝
* `size` - File size
* `key` - File key(buffer)✝
* `timestamp` - File creation time
* `nodeId` - File ID
* `downloadId` - Link ID to file. Only if created from link.
* `directory` - Boolean if file is directory.
* `children` - Array of files for directories.

✝ Those values are null or undefined when an encryption key isn't specified. See [security model](security-model.md) for more information.

## Methods:

### `.loadAttributes(callback)`

Load and decrypt file attributes. Attributes normally contain file name (`'n'`) but is possible to put anything there, as long it can be encoded as JSON. Isn't needed for files loaded from logged sessions. Trying to call it in a [`MutableFile`](mutable-file.md) will throw an error.

```javascript
mega.file(...).loadAttributes((err, file) => {
  // now file properties were loaded
})
```

This function can be also be used to load file information contained in shared folders.

### `.download([options], [callback])`

Download and decrypt file contents into a readable stream or, if a callback is specified, into a buffer.

```javascript
file.download().pipe(fs.createWriteStream('myfile.txt'))

file.download((err, data) => {
  // data is buffer
})
```

This function downloads files using chunked multiple parallel connections to speed up downloading. Similar to the MEGA implementation it first loads a 128KB chunk, then a 256KB, increasing it until it reaches 1MB. You can use the options below to control that.

* `maxConnections`: the number of parallel connections is defined (default: 4);
* `initialChunkSize`: first chunk size, in bytes (default: 128KB);
* `chunkSizeIncrement`: how many bytes to increment each time (default: 128KB);
* `maxChunkSize`: maximum chunk size, in bytes (max 1MB);

## Examples:

Loading a file by the share URL:

```javascript
const file = mega.file('https://mega.nz/#!some-file')

```

Loading a folder by the share URL:

```javascript
const folder = mega.file('https://mega.nz/#F!some-folder')
```

Loading a shared folder structure using `.loadAttributes`:

```javascript
const folder = mega.file('https://mega.nz/#F!...').loadAttributes((err, folder) => {
  if (err) throw err
  // Folder name is `folder.name`
  // Files are in the `folder.children` array
  const file = folder.children[0]

  // Files can be used as normal shared files
  file.download().pipe(fs.createWriteStream(file.name))
})
```
