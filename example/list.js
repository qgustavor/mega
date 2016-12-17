import fs from 'fs'
import mega from 'mega'
import optimist from 'optimist'
const argv = optimist
  .demand(2)
  .usage('USAGE: node example/list <email> <password>\n' +
         '       node example/list <email> <password> --download pattern\n' +
         '       node example/list <email> <password> --monitor')
  .argv

const storage = mega({
  email: argv._[0],
  password: argv._[1],
  keepalive: !!argv.monitor
})

storage.on('ready', () => {
  storage.mounts.forEach(f => { print(f) })

  for (const id in storage.files) {
    const f = storage.files[id]
    if (!f.directory) {
      if (f.name.includes(argv.download)) {
        console.log('Downloading', f.name)
        const dl = f.download()
        dl.pipe(fs.createWriteStream(f.name), {end: false})
        dl.on('end', () => {
          console.log('Downloading', f.name, 'OK')
        })
      }
    }
  }

  if (!argv.monitor) {
    storage.close()
  }
})

function print (f, indent = '') {
  console.log(indent, f.directory ? '+' : '-', f.name,
    f.directory ? '' : `${f.size}B`, new Date(f.timestamp * 1000),
    `(${f.nodeId})`)

  if (f.children) {
    f.children.forEach(f => {
      print(f, `${indent}  `)
    })
  }
}

if (argv.monitor) {
  storage.api.on('sc', json => {
    // const inspect = require('util').inspect;
    // console.log('server notification>', inspect(json, false, 4))
  })

  storage.on('update', f => {
    console.log('> File changed. New name:', f.name)
  })

  storage.on('add', f => {
    console.log('> New file added:', f.name)
  })

  storage.on('delete', f => {
    console.log('> File deleted:', f.name)
  })

  storage.on('move', (f, from) => {
    console.log('> File', f.name, 'moved from', from.name, 'to', f.parent.name)
  })
}
