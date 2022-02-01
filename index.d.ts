import { EventEmitter } from 'events';

declare function megajs(options: megajs.StorageOpts, cb?: megajs.errorCb): megajs.Storage;

declare namespace megajs {
    export class Storage extends EventEmitter {
        api: API;
        key: Buffer;
        sid: string;
        aes: AES;
        name: string;
        user: any;
        email: string;
        shareKeys: any;
        options: StorageOpts;
        status: StorageStatus;
        root: MutableFile;
        trash: MutableFile;
        inbox: MutableFile;
        mounts: ReadonlyArray<File>[];
        files: { [id in string]: MutableFile };
        RSAPrivateKey: (number | number[])[]; // tsc generated this        
        static fromJSON(json: StorageJSON): Storage;
        constructor(options: StorageOpts, cb?: errorCb);
        login(cb: (error: err, storage: this) => void): void;
        reload(cb: (error: err, mount: ReadonlyArray<File>[], force?: boolean) => void): any; // "A required parameter cannot follow an optional parameter."
        mkdir(opt: mkdirOpts | string, cb?: errorCb): void;
        upload(opt: any, buffer: any, cb: any): void;
        close(cb: () => void): void;
        getAccountInfo(cb: (error: err, account: any) => void): void;
        toJSON(): StorageJSON;
        on(event: 'add', listener: (File: MutableFile) => void): this;
        on(event: 'move', listener: (file: File, oldParent: File) => void): this;
        on(event: 'ready', listener: (storage: this) => void): this;
        on(event: 'update', listener: (file: MutableFile) => void): this;
        on(event: 'delete', listener: (file: Readonly<File>) => void): this;
        once(event: 'add', listener: (File: MutableFile) => void): this;
        once(event: 'move', listener: (file: File, oldParent: File) => void): this;
        once(event: 'ready', listener: (storage: this) => void): this;
        once(event: 'update', listener: (file: MutableFile) => void): this;
        once(event: 'delete', listener: (file: Readonly<File>) => void): this;
    }
    export class API extends EventEmitter {
        constructor(keepalive: boolean, opts: APIOpts);

    }

    export class File extends EventEmitter {
        constructor(opts: FileOpts);
    }
    export class MutableFile extends File {
        constructor(opts: FileOpts, storage: Storage);
        mkdir(opts: mkdirOpts | string, cb?: errorCb): void;
    }
    export class AES {
        key: Buffer;
        constructor(key: Buffer);
        encryptCBC(buffer: Buffer): Buffer;
        decryptCBC(buffer: Buffer): Buffer;
        stringhash(buffer: Buffer): Buffer;
        encryptECB(buffer: Buffer): Buffer;
        decryptECB(buffer: Buffer): Buffer;
    }
    // Interfaces & Types
    type StorageStatus = 'ready' | 'connecting' | 'closed';
    type errorCb = (error: err) => void;
    type err = Error | null;
    interface mkdirOpts {
        name: string;
        attributes?: any; // For now
        target?: MutableFile; // or File maybe?
        key?: Buffer;
    }
    interface StorageOpts {
        email: string;
        password: string;
        autoload?: boolean;
        autologin?: boolean;
        keepalive?: boolean;
    }
    interface StorageJSON {
        key: string;
        sid: string;
        name: string;
        user: any; // Not sure what this is
        options: StorageOpts;
    }
    interface APIOpts {

    }

    interface FileOpts {

    }
}


export = megajs;