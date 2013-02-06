var fs = require('fs')
var ProgressBar = require('progress')
var argv = require('optimist')
  .demand(1)
  .usage('USAGE: node example/download http://mega.co.nz/#!link!key')
  .argv


var mega = require('../lib/mega')

mega.file(argv._[0]).loadAttributes(function(err, file) {
  if (err) throw err

  console.log(file.name, file.size + 'B')

  var dl = file.download()
  dl.pipe(fs.createWriteStream(file.name), {end: false})

  var bar
  dl.on('progress', function (stats) {
    if (!bar) bar = new ProgressBar('downloading [:bar] :percent :etas', {
      total: stats.bytesTotal,
      width: 50
    })
    bar.tick(stats.bytesLoaded - bar.curr)
  })

  dl.on('end', function() {
    console.log('\nSaved OK!')
  })
})
