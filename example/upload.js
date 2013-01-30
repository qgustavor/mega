var fs = require('fs')
var path = require('path')
var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/list <email> <password> <file>')
  .argv

var storage = mega(argv._[0], argv._[1])

storage.on('ready', function() {
  storage.upload(path.basename(argv._[2]), fs.readFileSync(argv._[2]), function(err, file) {
    console.log('uploaded', file.name, file.size + 'B')
  })
})

