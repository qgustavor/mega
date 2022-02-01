/// <reference types="node" />
import { Transform } from 'stream';
import { EventEmitter } from 'events';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

import AbortController from 'abort-controller'
import type * as fetch from 'node-fetch';

declare function megajs(options: megajs.StorageOpts, cb?: megajs.errorCb): megajs.Storage;

declare namespace megajs {

    export function megaEncrypt(key: Buffer, options?: megaCryptOpts): void | Transform;
    export function megaDecrypt(key: Buffer, options?: megaCryptOpts): Transform;
    export function megaVerify(key: Buffer): void | Transform;

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
        constructor(options: StorageOpts, cb?: errorCb);
        toJSON(): StorageJSON;
        close(cb: () => void): void;
        static fromJSON(json: StorageJSON): Storage;
        mkdir(opt: mkdirOpts | string, cb?: errorCb): void;
        upload(opt: any, buffer: any, cb: any): void;
        login(cb: (error: err, storage: this) => void): void;
        getAccountInfo(cb: (error: err, account: any) => void): void;
        reload(cb: (error: err, mount: ReadonlyArray<File>[], force?: boolean) => void): any; // "A required parameter cannot follow an optional parameter."
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
        fetch: any;
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
        defaultFetch(url: fetch.RequestInfo, opts?: fetch.RequestInit): any;
        // Not sure what is the type of response in callback
        request(json: { [key in string]: any }, cb: (error: err, response?: any) => void, retryno?: number): void;
    }

    export class File extends EventEmitter {
        constructor(opts: FileOpts);
    }
    export class MutableFile extends File {
        constructor(opts: FileOpts, storage: Storage);
        mkdir(opts: mkdirOpts | string, cb?: errorCb): void;
        upload(opts: uploadOpts | string, data?: any, cb?: any): void;
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
        fetch?: any;
    }
    interface FileOpts {

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
        key?: Buffer;
    }
    interface uploadOpts {
        name: string;
        key?: Buffer | string;
        size?: number;
        maxChunkSize?: number;
        maxConnections?: number;
        initialChunkSize?: number;
        chunkSizeIncrement?: number;
        previewImage?: Buffer | ReadableStream; // Not entirely sure about the ReadableStream as the type
        thumbnailImage?: Buffer | ReadableStream;
    }
    interface megaCryptOpts {
        start?: number;
        disableVerification?: boolean;
    }

}


export = megajs;