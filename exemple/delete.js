module.exports = function (storage) {
    //list of nodeId of files/directory
    let nodeId = ['tkh21S7L', 'UgpCSKBA', 'I5RUHTwQ', 'UkJwGZoT'];
    //this operation will took place while the storage is on ready mode
    storage.on("ready", function () {
        if (storage.files[nodeId[0]]) {
            storage.files[nodeId[0]].delete(function (err, file) {
                if (err) throw err;
                // while delete a file/folder its goes into the "rushbbin " for the fist time before to be remove completely be remove from your account
                console.log(storage.files[nodeId[0]].name);
            });
        } else {
            console.error("no such node:", nodeId[0]);
        }
    });
};