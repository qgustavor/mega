import { parse } from 'url'
import * as crypto from './crypto'

function mega (...args) {
  return new mega.Storage(...args)
}

import { Storage } from './storage'
mega.Storage = Storage

import { File } from './file'
mega.File = File

export default mega

mega.file = function (opt) {
  if (typeof opt === 'object') {
    return new mega.File(opt)
  }

  const url = parse(opt)
  if (url.hostname !== 'mega.nz' && url.hostname !== 'mega.co.nz') throw Error('Wrong URL supplied: wrong hostname')
  if (!url.hash) throw Error('Wrong URL supplied: no hash')

  const split = url.hash.split('!')
  if (split.length <= 1) throw Error('Wrong URL supplied: too few arguments')
  if (split.length >= 4) throw Error('Wrong URL supplied: too many arguments')
  if (split[0] !== '#' && split[0] !== '#F') throw Error('Wrong URL supplied: not recognized')

  return new mega.File({
    downloadId: split[1],
    key: split[2],
    directory: split[0] === '#F'
  })
}

// backyards compatibility
mega.encrypt = crypto.megaEncrypt
mega.decrypt = crypto.megaDecrypt

// for testing
mega.crypto = crypto
