import mega from 'mega'
import optimist from 'optimist'
const argv = optimist
  .demand(2)
  .usage('USAGE: node example/delete <email> <password> <nodeId>')
  .argv

const storage = mega({
  email: argv._[0],
  password: argv._[1],
  keepalive: false
})

storage.on('ready', () => {
  if (storage.files[argv._[2]]) {
    storage.files[argv._[2]].delete(err => {
      if (err) {
        throw (err)
      }
      console.log(storage.files[argv._[2]].name, 'deleted')
    })
  } else {
    throw Error(`No such node: ${argv._[2]}`)
  }
})

