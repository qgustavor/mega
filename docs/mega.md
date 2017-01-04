# MEGA

The default export of the library is the MEGA object. It offers aliases to other objects.

## `Storage`

Alias to [`Storage`](Storage.md)

## `File`

Alias to [`File`](File.md)

## `file`

Alias to [`File.fromURL`](File.md)

## `mega.encrypt([key])` / `mega.decrypt(key)`

Lower level duplex streams. Takes in encrypted file data and outputs decrypted data and vice versa. Also does MAC verification / generation.

Note that if you specify key for `encrypt()` it needs to be 192bit. Other 64bit are for the MAC. You can later read the full key from the `key` property of the stream.
