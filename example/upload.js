import fs from 'fs'
import path from 'path'
import mega from 'mega'
import ProgressBar from 'progress'
import optimist from 'optimist'
const argv = optimist
  .demand(1)
  .usage('USAGE: node example/upload [email] [password] <file>')
  .argv

let [ email, password, filepath ] = argv._

if (argv._.length === 1) {
  email = password = undefined
  filepath = argv._[0]
}

const storage = mega({ email, password, keepalive: false })

const up = storage.upload({
  name: path.basename(filepath),
  size: fs.statSync(filepath).size // removing this causes data buffering.
}, (err, file) => {
  if (err) throw err
  console.log('\nUploaded', file.name, `${file.size}B`)

  file.link((err, link) => {
    if (err) throw err
    console.log('Download from:', link)
  })
})

fs.createReadStream(filepath).pipe(up)

let bar
up.on('progress', stats => {
  if (!bar) {
    bar = new ProgressBar('Uploading [:bar] :percent :etas', {
      total: stats.bytesTotal,
      width: 50
    })
  }
  bar.tick(stats.bytesLoaded - bar.curr)
})

up.on('complete', () => {
  bar.tick()
})
