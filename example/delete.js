var fs = require('fs')
var path = require('path')
var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/delete <email> <password> <nodeId>')
  .argv

var storage = mega(argv._[0], argv._[1])

storage.on('ready', function() {
  if (storage.files[argv._[2]]) {
    storage.files[argv._[2]].delete(function(err) {
      if (err) {
        throw(err)
      }
      console.log(storage.files[argv._[2]].name, 'deleted')
    })
  }
  else {
    throw(new Error('No such node: ' + argv._[2]))
  }
})

