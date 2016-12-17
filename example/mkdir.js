import mega from 'mega'
import optimist from 'optimist'
const argv = optimist
  .demand(1)
  .usage('USAGE: node example/mkdir [email] [password] name [parent-nodeid]')
  .argv

let [ email, password, name, target ] = argv._

if (argv._.length < 3) {
  email = password = undefined
  name = argv._[0]
  target = argv._[1]
}

const storage = mega({ email, password, keepalive: false })

storage.mkdir({ name, target }, (err, file) => {
  if (err) throw err
  console.log('\nCreated', file.name)
})
