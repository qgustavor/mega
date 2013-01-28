## Work in progress. Nothing functional.

###Plan

- This is all unofficial and only serves as an educational hack.
- I only plan to implement part of the API.
- Official SDK will probably be released in the future.
- Based on [developer guide](https://mega.co.nz/#developers) and site source.
- Crypto is mostly ported from browser code and isn't optimal. Probably some of it could be done with openssl, [ursa](https://github.com/Obvious/ursa) or [cryptojs](https://github.com/gwjjeff/cryptojs.git) or the algorithms could at least be ported to use Buffer format, but this is no way a priority.
- If you use it for something make sure you agree with Mega's [Terms of Service](https://mega.co.nz/#terms).


###API

```
var mega = require('mega')


var storage = mega([email], [pass], [cb])
// user, pass also optional


storage.email
storage.status = connecting | ready | closed
// After status = ready
storage.user
storage.key
storage.sid

storage.on('ready', ...)
storage.on(<server-to-client-calls>)

storage.listFiles([root], function(err, files))
storage.download(name, [cb])
storage.upload(name, [buffer], [cb])

file.download([cb])
file.getName([cb])
file.getLink([cb])

storage.close()

mega.file(link, key, [cb])

```