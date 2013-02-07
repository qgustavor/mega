var fs = require('fs')
var path = require('path')
var mega = require('../lib/mega')
var ProgressBar = require('progress')
var argv = require('optimist')
  .demand(1)
  .usage('USAGE: node example/upload [email] [password] <file>')
  .argv

var email = argv._[0]
var password = argv._[1]
var filepath = argv._[2]

if (argv._.length === 1) {
  email = password = undefined
  filepath = argv._[0]
}

var storage = mega({email:email, password:password, keepalive: false})

var up = storage.upload({
    name: path.basename(filepath),
    size: fs.statSync(filepath).size // removing this causes data buffering.
  },
  // fs.readFileSync(filepath),
  function(err, file) {
    if (err) throw err
    console.log('\nUploaded', file.name, file.size + 'B')

    file.link(function(err, link) {
      if (err) throw err
      console.log('Download from:', link)
    })
  })

fs.createReadStream(filepath).pipe(up)

var bar
up.on('progress', function (stats) {
  if (!bar) bar = new ProgressBar('Uploading [:bar] :percent :etas', {
    total: stats.bytesTotal,
    width: 50
  })
  bar.tick(stats.bytesLoaded - bar.curr)
})
up.on('complete', function() {
  bar.tick()
})