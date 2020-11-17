module.exports = function (storage) {
    let filepath = "input.txt"; // 
    let read = fs.createReadStream(filepath);
    let up = storage.upload({
            name: path.basename(filepath),
            size: fs.statSync(filepath).size, // removing this causes data buffering.
            // attributes:{n:dir}
            // target: {// add this , to specify where to upload the file
            //     nodeId: 'Z0hQXagB'
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
};