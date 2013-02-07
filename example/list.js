var fs = require('fs')
var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/list <email> <password>\n' +
         '       node example/list <email> <password> --download pattern\n' +
         '       node example/list <email> <password> --monitor')
  .argv

var storage = mega({email: argv._[0], password:argv._[1], keepalive: !!argv.monitor})

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
    var inspect = require('util').inspect
    //console.log('server notification>', inspect(json, false, 4))
  })

  storage.on('update', function(f) {
    console.log('> File changed. New name:', f.name)
  })

  storage.on('add', function(f) {
    console.log('> New file added:', f.name)
  })

  storage.on('delete', function(f) {
    console.log('> File deleted:', f.name)
  })

  storage.on('move', function(f, from) {
    console.log('> File', f.name, 'moved from', from.name, 'to', f.parent.name)
  })


}
