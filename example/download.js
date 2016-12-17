import mega from 'mega'
import fs from 'fs'
import ProgressBar from 'progress'
import optimist from 'optimist'
const argv = optimist
  .demand(1)
  .usage('USAGE: node example/download http://mega.nz/#!link!key')
  .argv

mega.file(argv._[0]).loadAttributes((err, file) => {
  if (err) throw err

  console.log('File:', file.name, `${file.size}B`)

  const dl = file.download()
  dl.pipe(fs.createWriteStream(file.name))

  let bar
  dl.on('progress', stats => {
    if (!bar) {
      bar = new ProgressBar('Downloading [:bar] :percent :etas', {
        total: stats.bytesTotal,
        width: 50
      })
    }
    bar.tick(stats.bytesLoaded - bar.curr)
  })

  dl.on('end', () => {
    bar.tick()
    console.log('\nSaved OK!')
  })
})
