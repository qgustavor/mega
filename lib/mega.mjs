import { megaEncrypt, megaDecrypt, megaVerify } from './crypto/index.mjs'
import Storage from './storage.mjs'
import File from './file.mjs'
import MutableFile from './mutable-file.mjs'
import API from './api.mjs'

// ES module bundles entry
const fileFromURL = File.fromURL

export {
  Storage,
  File,
  MutableFile,
  API,
  fileFromURL as file,
  megaEncrypt as encrypt,
  megaDecrypt as decrypt,
  megaVerify as verify
}
