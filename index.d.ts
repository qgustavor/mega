/// <reference types="node" />
import { Transform } from 'stream';
import { EventEmitter } from 'events';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

import AbortController from 'abort-controller'
import type * as fetch from 'node-fetch';

declare function megajs(options: megajs.StorageOpts, cb?: megajs.errorCb): megajs.Storage;

declare namespace megajs {

    export function megaEncrypt(key: Buffer, options?: cryptOpts): void | Transform;
    export function megaDecrypt(key: Buffer, options?: cryptOpts): Transform;
    export function megaVerify(key: Buffer): void | Transform;

    export class Storage extends EventEmitter {
        api: API;
        key: Buffer;
        sid: string;
        aes: AES;
        name: string;
        user: any; // Not sure
        email: string;
        shareKeys: any; // Not sure
        options: StorageOpts;
        status: StorageStatus;
        root: MutableFile;
        trash: MutableFile;
        inbox: MutableFile;
        mounts: ReadonlyArray<File>[];
        files: { [id in string]: MutableFile };
        RSAPrivateKey: (number | number[])[]; // tsc generated this        
        constructor(options: StorageOpts, cb?: errorCb);
        toJSON(): StorageJSON;
        close(cb: () => void): void;
        static fromJSON(json: StorageJSON): Storage;
        mkdir(opt: mkdirOpts | string, cb?: errorCb): void;
        upload(opt: any, buffer: any, cb: any): void;
        login(cb: (error: err, storage: this) => void): void;
        getAccountInfo(cb: (error: err, account: any) => void): void;
        // "A required parameter cannot follow an optional parameter."
        // Do check this because in source code force is the first argument but I had to change the order because of above error
        reload(cb: (error: err, mount: ReadonlyArray<File>[], force?: boolean) => void): any;
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
        fetch: Fetch;
        gateway: string;
        counterId: string;
        userAgent: string;
        keepalive: boolean;
        httpAgent: HttpAgent;
        httpsAgent: HttpsAgent;
        sn?: AbortController;
        static globalApi?: API;
        static getGlobalApi(): API;
        constructor(keepalive: boolean, opts?: APIOpts);
        close(): void;
        pull(sn: AbortController, retryno?: number): void;
        wait(url: fetch.RequestInfo, sn: AbortController): void;
        defaultFetch(url: fetch.RequestInfo, opts?: fetch.RequestInit): Fetch;
        // Not sure what is the type of response in callback
        request(json: { [key in string]: any }, cb: (error: err, response?: any) => void, retryno?: number): void;
    }

    export class File extends EventEmitter {
        api: API;
        name: string | null;
        size?: number;
        owner?: string;
        type: number;
        key: Buffer | null;
        downloadId: string;
        directory: boolean;
        loadedFile?: any;
        timestamp?: number;
        attributes: BufferString;
        label: string;
        favorited: boolean;
        nodeId?: any;
        constructor(opts: FileOpts);
        static fromURL(opt: any, extraOpt?: {}): File;
        static unpackAttributes(at: any): any;
        static defaultHandleRetries(tries: any, error: any, cb: any): void;
        get createdAt(): number;
        checkConstructorArgument(value: BufferString): void;
        loadMetadata(aes: any, opt: any): void;
        decryptAttributes(at: BufferString): this;
        parseAttributes(at: BufferString): void;
        loadAttributes(cb: BufferString): this;
        download(options: any, cb: any): any;
        link(options: any, cb: any, ...args: any[]): void;
    }
    export class MutableFile extends File {
        storage: Storage;
        static packAttributes(attributes: any): Buffer;
        constructor(opts: FileOpts, storage: Storage);
        mkdir(opts: mkdirOpts | string, cb?: errorCb): void;
        upload(opts: uploadOpts | string, source?: BufferString, cb?: any): any;
        uploadAttribute(type: any, data: any, callback: any): void;
        delete(permanent: any, cb: any): this;
        moveTo(target: any, cb: any): this;
        setAttributes(attributes: any, cb: any): this;
        rename(filename: any, cb: any): this;
        setLabel(label: any, cb: any): this;
        setFavorite(isFavorite: any, cb: any): this;
        shareFolder(options: any, cb: any): this;
        unshareFolder(options: any, cb: any): this;
        importFile(sharedFile: any, cb: any): any;
        // Saw these in docs
        on(event: 'move', listener: (oldDir: File) => void): this;
        on(event: 'update', listener: (file: MutableFile) => void): this;
        on(event: 'delete', listener: (file: Readonly<File>) => void): this;
        once(event: 'move', listener: (oldDir: File) => void): this;
        once(event: 'update', listener: (file: MutableFile) => void): this;
        once(event: 'delete', listener: (file: Readonly<File>) => void): this;
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
    type BufferString = Buffer | string;
    type err = Error | null;
    type Fetch = any; // Change this if you can get the type of fetch
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
        gateway?: string;
        fetch?: Fetch;
    }
    interface FileOpts {
        api?: API;
        key?: BufferString;
        directory?: boolean;
        downloadId: string;
        loadedFile: any; // Not sure
    }
    interface accountInfo {
        type: number; // Not sure of the type
        spaceUsed: number;
        spaceTotal: number;
        downloadBandwidthUsed: number;
        downloadBandwidthTotal: number;
        sharedBandwidthUsed: number;
        sharedBandwidthLimit: number;
    }
    interface mkdirOpts {
        name: string;
        attributes?: any; // For now
        target?: MutableFile; // or File maybe?
        key?: BufferString;
    }
    interface uploadOpts {
        name: string;
        key?: BufferString;
        size?: number;
        maxChunkSize?: number;
        maxConnections?: number;
        initialChunkSize?: number;
        chunkSizeIncrement?: number;
        previewImage?: Buffer | ReadableStream; // Not entirely sure about the ReadableStream as the type
        thumbnailImage?: Buffer | ReadableStream;
    }
    interface cryptOpts {
        start?: number;
        disableVerification?: boolean;
    }
}

export = megajs;