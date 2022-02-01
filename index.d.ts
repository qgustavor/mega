import { EventEmitter } from 'events';

declare namespace megajs {
    interface StorageOpts {
        email: string;
        password: string;
        autoload?: boolean;
        autologin?: boolean;
        keepalive?: boolean;
    }
    type StorageStatus = 'ready' | 'connecting' | 'closed';
    export class Storage extends EventEmitter {
        static fromJSON(json: any): Storage;
        constructor(options: StorageOpts, cb?: (err: Error) => void);
        api: API;
        files: { [id in string]: MutableFile };
        options: StorageOpts;
        status: StorageStatus;
        login(cb: (error: Error, storage: this) => void): void;
        name: string;
        user: string;
        email: string;
        key: Buffer;
        aes: AES;
        sid: string;
        RSAPrivateKey: (number | number[])[]; // tsc generated this
        reload(cb: (error: Error, mount: ReadonlyArray<File>[], force?: boolean) => void): any; // "A required parameter cannot follow an optional parameter."
        mounts: ReadonlyArray<File>[];
        shareKeys: any;
        root: MutableFile;
        trash: MutableFile;
        inbox: MutableFile;
        mkdir(opt: any, cb: any): void;
        upload(opt: any, buffer: any, cb: any): any;
        close(cb: any): void;
        getAccountInfo(cb: any): void;
        toJSON(): {
            key: any;
            sid: any;
            name: any;
            user: any;
            options: any;
        };
        on(event: 'add', listener: (File: MutableFile) => void): this;
        on(event: 'move', listener: (file: File, oldParent: File) => void): this;
        on(event: 'ready', listener: (storage: this) => void): this;
        on(event: 'update', listener: (file: MutableFile) => void): this;
        on(event: 'delete', listener: (file: Readonly<File>) => void): this;
    }

    export class API extends EventEmitter {

    }
    export class File extends EventEmitter {

    }
    export class MutableFile extends File {

    }
    export class AES {

    }
}


export = megajs;