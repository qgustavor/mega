module.exports = function (storage) {
    storage.on("ready", function () {
        //list of nodeId for file/directory
        //for more information you can read the MEGA SDK documentation
        let nodeId = ['Z0hQXagB', 'YlRmVRCZ', 'UgpCSKBA', 'FkoQ2LLC'];
        let folder = nodeId[0]; // where to move to put the file/folder
        let file = nodeId[2];// element to be moved
        if (storage.files[file] && storage.files[folder]) {
            storage.files[file].moveTo(folder, function (err, file) {
                if (err) throw err;
                
                console.log(`file/directory has been moved`);
            });
        } else {
            console.log("no file/directory correspond to nodeid:", folder, file);
        }
    });
};