import { megaEncrypt, megaDecrypt } from './crypto'
import Storage from './storage'
import File from './file'
import API from './api'

// ES module bundles entry
const fileFromURL = File.fromURL

export {
  Storage,
  File,
  API,
  fileFromURL as file,
  megaEncrypt as encrypt,
  megaDecrypt as decrypt
}
