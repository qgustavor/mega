module.exports = function (storage) {
    storage.on("ready", function () {
        //list of nodeId of files/directorie 
        let nodeId = ['Z0hQXagB', 'YlRmVRCZ', 'UgpCSKBA', 'FkoQ2LLC'];
        let id = nodeId[0];
        //check if the element existe
        if (storage.files[id]) {
            //check the nodeId is a directory of a file
            let dir = storage.files[id].directory ? true : false;
            let name = storage.files[id].name;
            let ext, len = null;
            //check if is a file to extact the extension
            if (!dir) {
                let explode = name.split(".");
                let position = explode.length - 1;
                ext = explode[position];
            }
            let rename = "new Name";
            //add an extension if it is file, while rename the file
            //to avoid loosing type of file and information
            let torename = dir ? rename : `${rename}.${ext}`;
            storage.files[id].rename(torename, function (err, file) {
                if (err) throw err;
                console.log("file renamed", storage.files[id].name);
            });
        } else {
            console.log("No such directory/files Existe with nodeId:", id);
        }
    });
};