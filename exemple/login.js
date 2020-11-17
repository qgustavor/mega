
const megajs =require("../lib/mega");

//option where you are goind to put
//credential authentication to connect to your mega account
//
let opt={
    email:"mail@mail.co",
    password:"*********"
};
const storage = megajs(opt, async function (err, res) {
    if (err) throw err;
    storage.mounts.map(function (f) {
        console.log(print(f));
    });
});
// get the architecture of your folder and files store on your mega account
// display directory and file on mega
function print(f, indent) {
    let dirFil = f.directory ? 'Directory' : 'File';
    let dir = {
        [dirFil]: f.name,
        "size": f.directory ? '' : f.size + 'B',
        "date": new Date(f.timestamp * 1000),
        "nodeID": f.nodeId,
        "child": !f.children ? [] : f.children.map(function (f) {
            return print(f);
        })
    };
    return dir;
}

//include renema module to rename a file/directory
require("./rename")(storage);

//include create remote directory module
require("./mkdir")(storage);

//include delete remote file/directory module
require("./delete")(storage);

//include moveto module
require("./moveto")(storage);

//include upload module to uplaod files
require("./uploado")(storage);