# Storage

Create a logged in connection instance to MEGA.

## Basic syntax:

```javascript
// CommonJS
const mega = require('mega')
let storage = mega(options)
let storage = mega.Storage(options, [callback])

// ES Modules
import { Storage } from 'mega'
let storage = new Storage(options, [callback])
```

## Supported options:

* `email` - User login email.
* `password` - User password.
* `keepalive` - Keep connection open to receive server-to-client requests that will be mapped to events. Defaults to `true`.
* `autologin` - Logins to MEGA. Defaults to `true`. Set to `false` if you want to change request options, like proxy.
* `autoload` - Load in file structure. Defaults to `true`.

Temporary accounts aren't supported. Tying to login without an email or password will throw an error.

## Properties:

Only loaded after `readyCallback()` or `ready` event fires.

* `name` - Account owner name
* `key` - Account master key
* `sid` - Current session ID
* `files` - Hash of `MutableFile` objects by node IDs.
* `root` - `MutableFile` object for Cloud Drive main directory
* `trash` - `MutableFile` object for Rubbish bin
* `inbox` - `MutableFile` object for Inbox
* `mounts` - Array of all top level directories

## Methods:

`.upload` and `.mkdir` methods maps to [`storage.root.upload`](MutableFile.md) and [`storage.root.mkdir`](MutableFile.md) methods.

### `.reload(cb)`

Reloads files tree. No need to call this if `autoload` is used.

## Events:

These events fire on file changes when `keepalive` is used. The changes can be triggered from any session connected to the same account.

* `add` - New file/dir was added. Parameters: file.
* `move` - File was moved to another dir. Parameters: file, olddir.
* `delete` - File was deleted. Parameters: file.
* `update` - File was changed(renamed). Parameters: file.
