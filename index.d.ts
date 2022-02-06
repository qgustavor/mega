/// <reference types="node" />
import { Readable, Writable, Transform } from 'stream';
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
        user: string;
        email: string;
        shareKeys: { [nodeId in string]: Buffer };
        options: StorageOpts;
        status: StorageStatus;
        root: MutableFile;
        trash: MutableFile;
        inbox: MutableFile;
        mounts: MutableFile[];
        files: { [id in string]: MutableFile };
        RSAPrivateKey: (number | number[])[];        
        constructor(options: StorageOpts, cb?: errorCb);
        toJSON(): StorageJSON;
        close(cb?: noop): void;
        static fromJSON(json: StorageJSON): Storage;
        mkdir(opt: mkdirOpts | string, cb?: errorCb): void;
        upload(opt: uploadOpts | string, buffer?: BufferString, cb?: uploadCb): Writable;
        login(cb: (error: err, storage: this) => void): void;
        getAccountInfo(cb: (error: err, account: accountInfo) => void): accountInfo;
        reload(cb: (error: err, mount: MutableFile[]) => void): void | this;
        reload(force: boolean, cb: (error: err, mount: MutableFile[]) => void): void | this;
        on(event: 'add', listener: (File: MutableFile) => void): this;
        on(event: 'move', listener: (file: MutableFile, oldDir: MutableFile) => void): this;
        on(event: 'ready', listener: (storage: this) => void): this;
        on(event: 'update', listener: (file: MutableFile) => void): this;
        on(event: 'delete', listener: (file: Readonly<File>) => void): this;
        once(event: 'add', listener: (File: MutableFile) => void): this;
        once(event: 'move', listener: (file: MutableFile, oldDir: MutableFile) => void): this;
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
        request(json: JSON, cb: (error: err, response?: any) => void, retryno?: number): void;
    }

    export class File extends EventEmitter {
        api: API;
        type: number;
        size?: number;
        label: string;
        owner?: string;
        nodeId?: string;
        loadedFile?: string;
        downloadId: string;
        directory: boolean;
        favorited: boolean;
        timestamp?: number;
        key: Nullable<Buffer>;
        name: Nullable<string>;
        attributes: JSON;
        constructor(opts: FileOpts);
        static fromURL(opt: FileOpts | string, extraOpt?: Partial<FileOpts>): File;
        static unpackAttributes(at: Buffer): void | JSON;
        static defaultHandleRetries(tries: number, error: err, cb: errorCb): void;
        get createdAt(): number;
        loadAttributes(cb: BufferString): this;
        parseAttributes(at: BufferString): void;
        decryptAttributes(at: BufferString): this;
        loadMetadata(aes: AES, opt: metaOpts): void;
        checkConstructorArgument(value: BufferString): void;
        link(options: linkOpts | boolean, cb: (error: err, url: string) => void): void;
        download(options: downloadOpts, cb?: (error: err, data: Buffer) => void): Readable;
    }
    export class MutableFile extends File {
        storage: Storage;
        static packAttributes(attributes: JSON): Buffer;
        constructor(opts: FileOpts, storage: Storage);
        mkdir(opts: mkdirOpts | string, cb?: (error: err, file: Nullable<MutableFile>) => void): void;
        upload(opts: uploadOpts | string, source?: BufferString, cb?: uploadCb): Writable;
        uploadAttribute(type: 0 | 1, data: Buffer, callback?: (error: err, file?: this) => void): void;
        delete(permanent?: boolean, cb?: (error: err, data?: any) => void): this;
        moveTo(target: File | string, cb?: (error: err, data?: any) => void): this;
        setAttributes(attributes: JSON, cb?: noop): this;
        rename(filename: string, cb?: noop): this;
        setLabel(label: labelType, cb?: noop): this;
        setFavorite(isFavorite?: boolean, cb?: noop): this;
        shareFolder(options: linkOpts, cb?: noop): this;
        unshare(cb?: noop): this;
        unshareFolder(cb?: noop): this;
        importFile(sharedFile: string | File, cb?: (error: err, file?: this) => void): void | this;
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
    // Interfaces & Type Aliases
    type labelType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | '' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'grey';
    type StorageStatus = 'ready' | 'connecting' | 'closed';
    type uploadCb = (error: err, file: MutableFile) => void;
    type errorCb = (error: err) => void;
    type BufferString = Buffer | string;
    type Nullable<T> = T | null;
    type err = Nullable<Error>;
    type noop = () => void;
    type Fetch = any; // Change this if you can get the types of fetch
    interface StorageOpts extends APIOpts {
        email: string;
        password: BufferString;
        autoload?: boolean;
        autologin?: boolean;
        keepalive?: boolean;
    }
    interface StorageJSON {
        key: string;
        sid: string;
        name: string;
        user: string;
        options: StorageOpts;
    }
    interface APIOpts {
        fetch?: Fetch;
        gateway?: string;
        httpAgent?: HttpAgent
        httpsAgent?: HttpsAgent
        userAgent?: Nullable<string>
    }
    interface FileOpts {
        api?: API;
        key?: BufferString;
        directory?: boolean;
        downloadId: string;
        loadedFile?: string;
    }
    interface accountInfo {
        type: string;
        spaceUsed: number;
        spaceTotal: number;
        downloadBandwidthUsed: number;
        downloadBandwidthTotal: number;
        sharedBandwidthUsed: number;
        sharedBandwidthLimit: number;
    }
    interface mkdirOpts {
        name: string;
        key?: BufferString;
        attributes?: JSON;
    }
    interface uploadOpts {
        name: string;
        key?: BufferString;
        size?: number;
        maxChunkSize?: number;
        maxConnections?: number;
        initialChunkSize?: number;
        chunkSizeIncrement?: number;
        previewImage?: Buffer | Readable;
        thumbnailImage?: Buffer | Readable;
    }
    interface cryptOpts {
        start?: number;
        disableVerification?: boolean;
    }
    interface linkOpts {
        noKey?: boolean;
        key?: BufferString;
    }
    interface metaOpts {
        k: string;
        t: unknown;
        s?: number;
        ts?: number;
        a?: BufferString;
    }
    interface downloadOpts {
        end?: number;
        start?: number;
        forceHttps?: boolean;
        maxChunkSize?: number;
        maxConnections?: number;
        initialChunkSize?: number;
        returnCiphertext?: boolean;
        chunkSizeIncrement?: number;
        handleRetries?: (tries: number, error: err, cb: errorCb) => void;
    }
}

export = megajs;
