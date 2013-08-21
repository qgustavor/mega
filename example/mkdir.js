var mega = require('../lib/mega')
var argv = require('optimist')
  .demand(1)
  .usage('USAGE: node example/mkdir [email] [password] name [parent-nodeid]')
  .argv

var email = argv._[0]
var password = argv._[1]
var name = argv._[2]
var target = argv._[3]

if (argv._.length < 3) {
  email = password = undefined
  name = argv._[0]
  target = argv._[1]
}

var storage = mega({email: email, password: password, keepalive: false})

storage.mkdir({
    name: name,
    target: target
  },
  function(err, file) {
    if (err) throw err
    console.log('\nCreated', file.name)
  }
)