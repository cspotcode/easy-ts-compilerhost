import ts, { DirectoryWatcherCallback, FileWatcherCallback, BuilderProgram, WatchCompilerHost, WatchStatusReporter, DiagnosticReporter, CreateProgram, CompilerOptions, FileWatcher, FileWatcherEventKind } from 'typescript';
import Path from 'path';
import {EventEmitter, Disposable} from 'ee-ts';
import { FileSystemEntries } from './ts-internals';

export class EasyCompilerHost {
    constructor(private opts: {
        compilerOptions: CompilerOptions,
        createProgram?: CreateProgram<ts.BuilderProgram>,
        reportDiagnostic?: DiagnosticReporter,
        reportWatchStatus?: WatchStatusReporter,
        hostOverrides: Partial<Pick<WatchCompilerHost<BuilderProgram>, 'afterProgramCreate'>>
    }) {
        const {compilerOptions} = this.opts;

        this.watchCompilerHost = {
            createProgram() {},
            fileExists(path) {},
            getCurrentDirectory(),
            getDefaultLibFileName(options),
            getNewLine(),
            readFile(path),
            useCaseSensitiveFileNames(),
            watchDirectory(path, callback),
            watchFile(path, callback),
        }
    }

    watchCompilerHost: WatchCompilerHost<BuilderProgram>;
}
export class VirtualSystem {
    constructor() {

        const system: ts.System = this.system = {
            args: [],
            // clearScreen() {},
            createDirectory: (path) => {
                //TODO
            },
            // deleteFile: (path) => {
            //     this.deleteFile(path);
            // },
            directoryExists: (path) => {
                // TODO
                return false;
            },
            // exit() {},
            fileExists: (path) => {
                return this._filesystem.has(this.normalizePath(path));
            },
            newLine: '\n',
            useCaseSensitiveFileNames: true,
            write(s) {},
            readFile: (path, encoding) => this._filesystem.get(this.normalizePath(path)),
            writeFile: (path, data, writeByteOrderMark) => this.setFile(path, data),
            resolvePath: (path) => this.normalizePath(path),
            getExecutingFilePath: () => require.resolve('typescript'),
            getCurrentDirectory: () => '/',
            getDirectories: (path) => {
                // TODO
                return [];
            },
            readDirectory: (path, extensions: ReadonlyArray<string>, exclude: ReadonlyArray<string>, include: ReadonlyArray<string>, depth: number) => {
                return matchFiles(path, extensions, exclude, include, system.useCaseSensitiveFileNames, system.getCurrentDirectory(), depth, getFileSystemEntries);
            },
            exit(code) {},
            watchDirectory: (path: string, callback: DirectoryWatcherCallback, recursive: boolean = false): FileWatcher => {
                const watchDirPath = this.normalizePath(path);
                const disposables: Array<Disposable> = [];
                this.fsEvents.on('created', handler, disposables);
                this.fsEvents.on('modified', handler, disposables);
                this.fsEvents.on('deleted', handler, disposables);
                function handler(path: string) {
                    const parsed = Path.posix.parse(path);
                    if(parsed.dir === watchDirPath || (recursive && parsed.dir.indexOf(watchDirPath + '/') === 0)) {
                        callback(path);
                    }
                }
                return {
                    close() {
                        disposables.forEach(d => d.dispose());
                    }
                };
            },
            watchFile: (path: string, callback: FileWatcherCallback, pollingInterval?: number): FileWatcher => {
                const watchFilePath = this.normalizePath(path);
                const disposables: Array<Disposable> = [];
                this.fsEvents.on('created', handler(FileWatcherEventKind.Created), disposables);
                this.fsEvents.on('modified', handler(FileWatcherEventKind.Changed), disposables);
                this.fsEvents.on('deleted', handler(FileWatcherEventKind.Deleted), disposables);
                function handler(kind: FileWatcherEventKind) {
                    return function(path: string) {
                        if(path === watchFilePath) {
                            callback(path, kind);
                        }
                    }
                }
                return {
                    close() {
                        disposables.forEach(d => d.dispose());
                    }
                };
            }
        };
        
        const getFileSystemEntries = (path: string): FileSystemEntries => {
            const files: Array<string> = [];
            const directories: Array<string> = [];
            for(const file of this._filesystem.keys()) {
                if(file.indexOf(path + '/') !== 0) continue;
                if(Path.posix.parse(file).dir === file) files.push(file);
                else directories.push(file);
            }
            return {files, directories};
        };
    }

    readonly system: ts.System;

    deleteFile(path: string) {
        const normalizedPath = this.normalizePath(path);
        const fileAlreadyExists = this.filesystem.has(normalizedPath);
        if(fileAlreadyExists) {
            this._filesystem.delete(normalizedPath);
            this.fsEvents.emit('deleted', normalizedPath);
        }
    }
    setFile(path: string, content: string) {
        const normalizedPath = this.normalizePath(path);
        const fileAlreadyExists = this._filesystem.has(normalizedPath);
        this._filesystem.set(normalizedPath, content);
        this.fsEvents.emit(fileAlreadyExists ? 'modified' : 'created', path, content);
    }

    normalizePath(path: string) {
        let normalized = Path.posix.normalize(path);
        if(normalized.slice(0, 2) === '..') throw new Error('unsupported path');
        if(normalized[0] !== '/') normalized = '/' + normalized;
        return normalized;
    }



    fsEvents = new EventEmitter<FsEvents>();

    _filesystem = new Map<string, string>();
    get filesystem(): ReadonlyMap<string, string> { return this._filesystem; }

}

interface FsEvents {
    created(path: string, content: string): void;
    modified(path: string, content: string): void;
    deleted(path: string): void;
}
