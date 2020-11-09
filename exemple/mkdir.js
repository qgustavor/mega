module.export = function (storage) {
    // create a directory
    //to create a sub-folder you have to provide the target option and the nodeId of the folder
    //otherwise the folder will be created at the root of your account
    storage.mkdir({
        name: "MyDirectory",
        // target: { // add this incase you
        //     nodeId: 'Z0hQXagB'
        // }
    }, function (err, file) {
        if (err) throw err;
        console.log("Directory created with success:", file.name);
    });
};
