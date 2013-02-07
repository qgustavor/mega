var fs = require('fs')
var ProgressBar = require('progress')
var argv = require('optimist')
  .demand(1)
  .usage('USAGE: node example/download http://mega.co.nz/#!link!key')
  .argv


var mega = require('../lib/mega')

mega.file(argv._[0]).loadAttributes(function(err, file) {
  if (err) throw err

  console.log('File:', file.name, file.size + 'B')

  var dl = file.download()
  dl.pipe(fs.createWriteStream(file.name))

  var bar
  dl.on('progress', function (stats) {
    if (!bar) bar = new ProgressBar('Downloading [:bar] :percent :etas', {
      total: stats.bytesTotal,
      width: 50
    })
    bar.tick(stats.bytesLoaded - bar.curr)
  })

  dl.on('end', function() {
    bar.tick()
    console.log('\nSaved OK!')
  })
})
