const fs = require('fs')
const path = require('path')

fs.access(path.resolve(__dirname, '../.babelrc.build'), err => {
  // if don't exists is because tests were already cleaned because those failed
  if (err) process.exit(1)
  fs.renameSync(path.resolve(__dirname, '../.babelrc'), path.resolve(__dirname, '.babelrc'))
  fs.renameSync(path.resolve(__dirname, '../.babelrc.build'), path.resolve(__dirname, '../.babelrc'))
})
