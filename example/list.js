var fs = require('fs')
var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/list <email> <password>\n' +
         '       node example/list <email> <password> --download pattern\n' +
         '       node example/list <email> <password> --monitor')
  .argv

var storage = mega(argv._[0], argv._[1])

storage.on('ready', function() {
  storage.mounts.forEach(function(f) {print(f)})

  for (var id in storage.files) {
    var f = storage.files[id]
    if (!f.directory) {
      if (f.name.indexOf(argv.download) != -1) {
        (function(f) {
        console.log('Downloading', f.name)
        var dl = f.download()
        dl.pipe(fs.createWriteStream(f.name), {end: false})
        dl.on('end', function() {
          console.log('Downloading', f.name, 'OK')
        })
        })(f)
      }
    }
  }

  if (!argv.monitor) {
    storage.close()
  }

})

function print(f, indent) {
  indent = indent || ''
  console.log(indent, f.directory ? '+' : '-', f.name,
    f.directory ? '' : f.size + 'B', new Date(f.timestamp * 1000),
    '(' + f.nodeId + ')')
  if (f.children) {
    f.children.forEach(function(f) {
      print(f, indent + '  ')
    })
  }
}

if (argv.monitor) {
  storage.api.on('sc', function(json) {
    console.log('server notification>', json)
  })

  setTimeout(function(){}, 1e9)
}
