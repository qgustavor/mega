import { megaEncrypt, megaDecrypt } from './crypto'
import Storage from './storage'
import File from './file'

// ES module bundles entry
const fileFromURL = File.fromURL

export {
  Storage,
  File,
  fileFromURL as file,
  megaEncrypt as encrypt,
  megaDecrypt as decrypt
}
