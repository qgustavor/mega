# Security model

## Logged sessions are unsafe when used in web pages

The Web Platform security model is something like "always trust on the server". That's because most of developers which write standards had problems with pages cached for a long time causing problems. So if a server can be trusted (i.e. TLS certificates are OK) it will have higher priority than local stored data.

So a website is only safe as if the server serving it isn't compromised. Doesn't matter if you use HTTPS or do client side checksums checks (like MEGA do, those are just [security theater](https://en.wikipedia.org/wiki/Security_theater)) because if some of the checked resources can be tampered nothing stops the verification script also being tampered. Even long caching the verification script, enforcing it with service workers or anything similar will not work, because the server will have the priority.

TL;DR: don't use [`Storage`](Storage.md) in a web page.

## Encryption keys are optional in some cases

MEGA allows access to some file and folder metadata without needing encryption keys. Because this detail this library don't requires specifying encryption keys.

If your use case needs access to decrypted data assert the existence of `file.key`. Not all use cases need it, like checking if a folder exists or if folder contents were modified. Working example: the folder2rss web tool, in order to provide users more privacy, works [with keys](https://tinyurl.com/folder2rss?81skTRYK!Ybk7gc4oQfbOM_5P3POzcw) and [without encryption keys](https://tinyurl.com/folder2rss?81skTRYK).

Currently downloading files don't work if the encryption key isn't provided, but maybe it will be changed in future.

## Just some data is encrypted

MEGA only encrypts the following data:

* File contents
* File names
* Thumbnails and preview images
* Encryption keys
* Color labels and favorite state

The following data are not encrypted:

* File sizes, upload dates, IPs, user agents (as many services do)
* Folder structure
* Sharing info
* If a file was or not an thumbnail or preview image

## This library allows non-random keys

Because it makes testing easier and allows password-based keys but when security and privacy is needed don't use any type of passwords directly as keys, instead consider using [key derivation functions](https://en.wikipedia.org/wiki/Key_derivation_function). Safe MEGA, as an example, uses 256000 iterations of PBKDF2-SHA512, using the SHA512 of the folder handler and/or a URL specified string as salt.
