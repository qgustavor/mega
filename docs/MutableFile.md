# MutableFile

Extends [`File`](File.md) adding methods that are only available when logged in.

**Please note:** what are mutable are the attributes of the files and folders, **not** their contents, as MEGA don't support it yet.

## Basic syntax:

Those objects can be only accessed when logged in and can only be accessed via the properties of the [`Storage`](Storage.md) object.

```javascript
storage.root.children[0] // the first file in the root of the storage
```

## Methods:

### `.upload(options | name, [buffer], [callback])`

Uploads a file to 

```javascript
fs.createReadStream('myfile.txt').pipe(folder.upload('myfile.txt'))
```

Upload a file to the folder. You can pass in buffer data or just pipe data into it. Callback returns uploaded file object. If you don't specify callback you can listen for `complete` event to get the file handle.

**Supported options:**

* `name`: file name, *required*
* `attributes`: object of file attributes
* `key`: encryption key, Buffer or string; 192 bit; because MAC verification part of it be different in final key
* `size`: file size. Note that because MEGA's API needs final data length before uploading can start, streaming only fully works if you specify the size of your data. Otherwise it needs to first buffer your data to determine the size
* `thumbnailImage`: the Buffer or Stream of the thumbnail image
* `previewImage`: the Buffer or Stream of the preview image

Thumbnail images are 120px x 120px JPEG images with 70% quality. Preview images are JPEG images with a maximum width and height size of 1000px and 75% quality.

Note that this library don't generates neither preview or thumbnail images, only provides a way to uploading those. Those can be generated in Node using ImageMagick or GraphicsMagick and in browser using `<canvas>`.

### `.mkdir(options | name, callback)`

```javascript
folder.mkdir('dirname', (err, file) => { ... })
```

Create a new folder inside the current folder.

**Supported options:**

* `name`: directory name, *required*
* `attributes`: object of file attributes
* `key`: encryption key, Buffer or string; 256bit; only used internally (when sharing folders other key is used)

### `.link([options], callback)` / `.shareFolder([options], callback)`

Make download link for a file or folder. `.shareFolder` only works for folders, `.link` works for both (but calls `.shareFolder` internally).

```javascript
file.link((err, url) => {
  // url: https://mega.nz/#!downloadId!key
})
```

Supported options:

* `noKey`: set `true` to return a url without an encryption key
* `key`: works only for folders, encryption key, can be a string or buffer, 128 bit

### `file.delete(permanent, callback)`

Delete file, permanently if `permanent` is true, otherwise file is moved to rubbish bin.

```javascript
file.delete((err) => {
  // file was moved to rubbish bin
})
```

### `file.moveTo(target, callback)`

Move a file to target, which can be a folder object or it's nodeId.

```javascript
file.moveTo(storage.root, (err) => {
  // file was moved to storage root
})
```

### `file.setAttributes(attributes, callback)`

Set the the attributes of a object. Doesn't remove the current ones, but can overwrite those.

```javascript
file.attributes({someAttribute: someValue}, (err) => {
  // attribute was set
})
```

### `file.rename(newFileName, callback)`

Rename a file.

```javascript
file.rename('hello-world.txt', (err) => {
  // file was renamed
})
```

### `file.setLabel(label, callback)`

Set file's label, where `label` can be a number between 0 and 7 or a valid label color from `File.LABEL_NAMES` ('red', 'orange', 'yellow', 'green', 'blue', 'purple' and 'grey').

```javascript
file.setLabel('red', (err) => {
  // file label is red now
})
```

### `file.setFavorite(isFavorite, callback)`

Set file as favorite is `isFavorite` is `true`

```javascript
file.isFavorite(true, (err) => {
  // file is now a favorite
})
```

## Events:

Same events as for Storage objects. Only trigger for a specific file.

* `move` - File was moved to another dir. Parameters: olddir.
* `delete` - File was deleted.
* `update` - File metadata was changed.
