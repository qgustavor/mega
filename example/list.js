var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/list <email> <password>')
  .argv

var storage = mega(argv._[0], argv._[1])

storage.on('ready', function() {
  storage.root.forEach(function(f) {print(f)})
})

function print(f, indent) {
  indent = indent || ''
  console.log(indent, f.directory ? '+' : '-', f.name, f.directory ? '' : f.size + 'B', new Date(f.timestamp * 1000))
  if (f.children) {
    f.children.forEach(function(f) {
      print(f, indent + '  ')
    })
  }
}