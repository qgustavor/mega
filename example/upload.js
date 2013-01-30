var fs = require('fs')
var path = require('path')
var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(2)
  .usage('USAGE: node example/list <email> <password> <file>')
  .argv

var storage = mega(argv._[0], argv._[1])

storage.on('ready', function() {
  fs.createReadStream(argv._[2]).pipe(
    storage.upload({
      name: path.basename(argv._[2]),
  //    size: fs.statSync(argv._[2]).size
    },
  //  fs.readFileSync(argv._[2]),
    function(err, file) {
      if (err) throw err
      console.log('Uploaded', file.name, file.size + 'B')

      file.link(function(err, link) {
        if (err) throw err
        console.log('Download from:', link)
      })
    })
  )
})

