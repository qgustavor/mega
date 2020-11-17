# MEGAJS

Unofficial JavaScript SDK for MEGA

* This is based on [tonistiigi's mega library](https://github.com/tonistiigi/mega).
* This is all unofficial, based on [developer guide](https://mega.nz/#developers) and site source.
* Make sure you agree with MEGA's [Terms of Service](https://mega.nz/#terms) before using it.
* Maybe an official SDK will probably be released in the future here: https://github.com/meganz/

## Installation

```shell
npm install megajs
```

```javascript
const mega = require('megajs') // or
import mega from 'megajs'
```

You can also load it in a browser using `<script src="https://unpkg.com/megajs/dist/main.node-cjs.js"></script>`, which exports the library in the `mega` global variable. You can also use `import * as mega from 'https://unpkg.com/megajs/dist/main.browser-es.js'`.

**For more details, API documentation and examples check wiki: https://github.com/qgustavor/mega/wiki**

The bundled files are available via [npm](https://www.npmjs.com/package/megajs) and [UNPKG](https://unpkg.com/megajs/dist/).

**For CLI usage check MEGAJS CLI**: https://github.com/qgustavor/megajs-cli

## Implementation notes

Only part of the file related API is implemented. For now implementing contact and chat functions seems out of scope.

Cryptography is mostly ported from browser code. In Node some parts are optimized: AES operations are done using native crypto. Sadly WebCrypto don't support streaming so in browser the old pure JavaScript implementation is used. The RSA operations aren't optimized as currently there isn't any need to improve that.

This module works in the browser: the "main.browser-umd.js" is a build using the UMD format where Node specific modules, like crypto and request modules, were replaced with browser equivalents. If you want to use tree shaking then use the "main.browser-es.js" bundle. This module wasn't tested in other environments.

## Fork objectives

This package started as a fork, with the following objectives:

* Make the original package work in browsers again: even following [the instructions from the original library](https://github.com/tonistiigi/mega#browser-support) it stopped working because some dependencies used `__proto__`, which is non-standard and isn't supported in many browsers. Also the updated versions of those libraries broke backyards compatibility;
* Reduce dependencies and replace big dependencies with smaller ones, like crypto libraries, which usually are huge;
* Rewrite code using the new JavaScript syntax, allowing to use [Rollup](http://rollupjs.org/), which can generate smaller bundles;
* Make tests work again after the changes above;
* Continue the original library development implementing new features and improving performance.

Request package was replaced with a shim based in [browser-request](https://www.npmjs.com/package/browser-request) and [xhr-stream](https://www.npmjs.com/package/xhr-stream), which additional changes in order to make it work inside Service Workers. Crypto was replaced with [secure-random](https://www.npmjs.com/package/secure-random).

As there were many changes there isn't any plan to merge those changes into the original library, unless the original author accept those massive changes. That's why I put "js" in the name, which is silly because both libraries use JavaScript. At least it's better than other ideas I had, like "mega2", "mega-es" and "modern-mega".

## Integration

* Login to MEGA account

```javascript
// credential to connect to your mega account
  const option={
    email:"email@mail.co",
    password:"*********"
  };
  //login to mega account
  const storage= mega(option,function(err,file){
    if(err) throw err;
    //display all file/folder form your MEGA account
    console.log("login success full");
  })
  
```

* Display Files/Directories

```javascript
//display your files and directories form your aacounts
const storage= mega(option,function(err,file){
    if(err) throw err;
    storage.mounts.map(function(f){
        console.log(print(f))
    });
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
})
```

* Upload Files to your account

```javascript
  let filepath = "input.txt";
    let read = fs.createReadStream(filepath);
    let up = storage.upload({
            name: path.basename(filepath),
            size: fs.statSync(filepath).size, // removing this causes data buffering.
            // attributes:{n:dir}
           // target: { // use this to specified the folder target where to upload the file
           //    nodeId: '' // add nodeId of the folder
           // }
        },
        fs.readFileSync(filepath),
        function (err, file) {
            if (err) throw err;
            console.log('Uploaded', file.name, file.size + 'B');

            file.link(function (err, link) {
                if (err) throw err
                console.log('Download from:', link);
            });
        });
```
* create a remote directory
to create a directory, it's very simple you just give the name of the directory
```javascript
  storage.mkdir("MyDirectory", function (err, file) {
        if (err) throw err;
        console.log("Directory created with success:", file.name);
    });
```
in case you want to add in a specic folder, you need to specify `nodeId` of the forlder,
witch you can get from `stotage.files` or when reading the mountable storage. 
checkout the `print(f)` function. 

```javascript
  storage.mkdir({
        name: "MyDirectory",
        target: { // add this to specify the target to reach
             nodeId: '********'
         }
    }, function (err, file) {
        if (err) throw err;
        console.log("Directory created with success:", file.name);
    });
```
* Delete a file/directory
to delete a file or directory, you need to specify the `nodeId` of the target,
more that when you delete a folder from the root it goes on the `Rubbin Bin`.
to do this operation the status should be on `ready` mode.
```javascript
  let nodeid='abcdef';
  storage.on("ready", function () {
        if (storage.files[nodeId]) {
            storage.files[nodeId].delete(function (err, file) {
                if (err) throw err;
                console.log(storage.files[nodeId].name);
            });
        } else {
            console.error("no such node:", nodeId);
        }
    });
```
* Move a File or Folder
To move a file or folder from one point to an other you need to specify first the `nodeId` of the folder or file to be moved,and then the `nodeId`, of the source where it will go and shoud be a folder.

```javascript
  storage.on("ready", function () {        
        let nodeId = ['abcde', 'jhijkl'];
        let folder = nodeId[0]; // destination where to move to put the file/folder
        let file = nodeId[2];// element to be moved file/folder
        if (storage.files[file] && storage.files[folder]) {
            storage.files[file].moveTo(folder, function (err, file) {
                if (err) throw err;
                
                console.log(`file/directory has been moved`);
            });
        } else {
            console.log("no file/directory correspond to nodeid:", folder, file);
        }
    });
```
* Rename a File/Folder
to rename a element first provide the `nodeId` the access the right file/folder,
then provide the new name of the element
```javascript
storage.on("ready", function () {
        let id = `nodeId`;
        if (storage.files[id]) {            
            storage.files[id].rename("new Name", function (err, file) {
                if (err) throw err;
                console.log("file renamed", storage.files[id].name);
            });
        } else {
            console.log("No such directory/files Existe with nodeId:", id);
        }
    });
```
in case you want to change the name of the file, you have to pay attention about the the extension of a file, to not loose information or the type of file.
you can define a simple methode to help resolve that.
for more precision checkout the exemple folder.

```javascript
storage.on("ready", function () {
        let id = `nodeId`;
        if (storage.files[id]) {
            let dir = storage.files[id].directory ? true : false;
            let name = storage.files[id].name;
            let ext, len = null;
            if (!dir) {
                let explode = name.split(".");
                let position = explode.length - 1;
                ext = explode[position];
            }
            let rename = "new Name";
            let torename = dir ? rename : `${rename}.${ext}`;
            storage.files[id].rename(torename, function (err, file) {
                if (err) throw err;
                console.log("file renamed", storage.files[id].name);
            });
        } else {
            console.log("No such directory/files Existe with nodeId:", id);
        }
    });
```
## Contributing

When contributing fork the project, clone it, run `npm install`, change the library as you want, run tests using `npm run test` and build the bundled versions using `npm run build`. Before creating a pull request, *please*, run tests.
