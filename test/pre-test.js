const fs = require('fs')
const path = require('path')

fs.accessSync(path.resolve(__dirname, '.babelrc'))
fs.renameSync(path.resolve(__dirname, '../.babelrc'), path.resolve(__dirname, '../.babelrc.build'))
fs.renameSync(path.resolve(__dirname, '.babelrc'), path.resolve(__dirname, '../.babelrc'))
