# @isomorphic-git/lightning-fs

A lean and fast 'fs' for the browser

## Motivation

I wanted to see if I could make something faster than [BrowserFS](https://github.com/jvilk/BrowserFS) or [filer](https://github.com/filerjs/filer) that still implements enough of the `fs` API to run the [`isomorphic-git`](https://github.com/isomorphic-git/isomorphic-git) test suite in browsers.

## Comparison with other libraries

This library does not even come close to implementing the full [`fs`](https://nodejs.org/api/fs.html) API.
Instead, it only implements [the subset used by isomorphic-git 'fs' plugin interface](https://isomorphic-git.org/docs/en/plugin_fs) plus the [`fs.promises`](https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_promises_api) versions of those functions.

Unlike BrowserFS, which has a dozen backends and is highly configurable, `lightning-fs` has a single configuration that should Just Work for most users.

## Philosophy

### Basic requirements:

1. needs to work in all modern browsers
2. needs to work with large-ish files and directories
3. needs to persist data
4. needs to enable performant web apps

Req #3 excludes pure in-memory solutions. Req #4 excludes `localStorage` because it blocks the DOM and cannot be run in a webworker. Req #1 excludes WebSQL and Chrome's FileSystem API. So that leaves us with IndexedDB as the only usable storage technology.

### Optimization targets (in order of priority):

1. speed (time it takes to execute file system operations)
2. bundle size (time it takes to download the library)
3. memory usage (will it work on mobile)

In order to get improve #1, I ended up making a hybrid in-memory / IndexedDB system:
- `mkdir`, `rmdir`, `readdir`, `rename`, and `stat` are pure in-memory operations that take 0ms
- `writeFile`, `readFile`, and `unlink` are throttled by IndexedDB

The in-memory portion of the filesystem is persisted to IndexedDB with a debounce of 500ms.
The files themselves are not currently cached in memory, because I don't want to waste a lot of memory.
Applications can always *add* an LRU cache on top of `lightning-fs` - if I add one internally and it isn't tuned well for your application, it might be much harder to work around.

### Multi-threaded filesystem access

Multiple tabs (and web workers) can share a filesystem. However, because SharedArrayBuffer is still not available in most browsers, the in-memory cache that makes LightningFS fast cannot be shared. If each thread was allowed to update its cache independently, then you'd have a complex distributed system and would need a fancy algorithm to resolve conflicts. Instead, I'm counting on the fact that your multi-threaded applications will NOT be IO bound, and thus a simpler strategy for sharing the filesystem will work. Filesystem access is bottlenecked by a mutex (implemented via polling and an atomic compare-and-replace operation in IndexedDB) to ensure that only one thread has access to the filesystem at a time. If the active thread is constantly using the filesystem, no other threads will get a chance. However if the active thread's filesystem goes idle - no operations are pending and no new operations are started - then after 500ms its in-memory cache is serialized and saved to IndexedDB and the mutex is released. (500ms was chosen experimentally such that an [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) `clone` operation didn't thrash the mutex.)

While the mutex is being held by another thread, any fs operations will be stuck waiting until the mutex becomes available. If the mutex is not available even after ten minutes then the filesystem operations will fail with an error. This could happen if say, you are trying to write to a log file every 100ms. You can overcome this by making sure that the filesystem is allowed to go idle for >500ms every now and then.

## Usage

### `new FS(name, opts?)`
First, create or open a "filesystem". (The name is used to determine the IndexedDb store name.)

```js
import FS from '@isomorphic-git/lightning-fs';

const fs = new FS("testfs")
```

**Note: It is better not to create multiple `FS` instances using the same name in a single thread.** Memory usage will be higher as each instance maintains its own cache, and throughput may be lower as each instance will have to compete over the mutex for access to the IndexedDb store.

Options object:

| Param           | Type [= default]   | Description                                                                                                                                                                                |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wipe`          | boolean = false    | Delete the database and start with an empty filesystem                                                                                                                                     |
| `url`           | string = undefined | Let `readFile` requests fall back to an HTTP request to this base URL                                                                                                                      |
| `urlauto`       | boolean = false    | Fall back to HTTP for every read of a missing file, even if unbacked                                                                                                                       |
| `fileDbName`    | string             | Customize the database name                                                                                                                                                                |
| `fileStoreName` | string             | Customize the store name                                                                                                                                                                   |
| `lockDbName`    | string             | Customize the database name for the lock mutex                                                                                                                                             |
| `lockStoreName` | string             | Customize the store name for the lock mutex                                                                                                                                                |
| `defer`         | boolean = false    | If true, avoids mutex contention during initialization                                                                                                                                     |
| `db`            | IDB                | Replacement for DB object that hold Filesystem data. It's low level replacement for `backend` option.  |
| `backend`       | IBackend           | If present, none of the other arguments (except `defer`) have any effect, and instead of using the normal LightningFS stuff, LightningFS acts as a wrapper around the provided custom backend. |


#### Advanced usage

You can procrastinate initializing the FS object until later.
And, if you're really adventurous, you can _re-initialize_ it with a different name to switch between IndexedDb databases.

```js
import FS from '@isomorphic-git/lightning-fs';

const fs = new FS()

// Some time later...
fs.init(name, options)

// Some time later...
fs.init(different_name, different_options)
```

### `fs.mkdir(filepath, opts?, cb)`

Make directory

Options object:

| Param  | Type [= default] | Description            |
| ------ | ---------------- | ---------------------- |
| `mode` | number = 0o777   | Posix mode permissions |

### `fs.rmdir(filepath, opts?, cb)`

Remove directory

### `fs.readdir(filepath, opts?, cb)`

Read directory

The callback return value is an Array of strings. NOTE: _To save time, it is NOT SORTED._ (Fun fact: Node.js' `readdir` output is not guaranteed to be sorted either. I learned that the hard way.)

### `fs.writeFile(filepath, data, opts?, cb)`

`data` should be a string of a Uint8Array.

If `opts` is a string, it is interpreted as `{ encoding: opts }`.

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `mode`     | number = 0o777     | Posix mode permissions           |
| `encoding` | string = undefined | Only supported value is `'utf8'` |

### `fs.readFile(filepath, opts?, cb)`

The result value will be a Uint8Array or (if `encoding` is `'utf8'`) a string.

If `opts` is a string, it is interpreted as `{ encoding: opts }`.

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `encoding` | string = undefined | Only supported value is `'utf8'` |

### `fs.unlink(filepath, opts?, cb)`

Delete a file

### `fs.rename(oldFilepath, newFilepath, cb)`

Rename a file or directory

### `fs.stat(filepath, opts?, cb)`

The result is a Stat object similar to the one used by Node but with fewer and slightly different properties and methods.
The included properties are:

- `type` ("file" or "dir")
- `mode`
- `size`
- `ino`
- `mtimeMs`
- `ctimeMs`
- `uid` (fixed value of 1)
- `gid` (fixed value of 1)
- `dev` (fixed value of 1)

The included methods are:
- `isFile()`
- `isDirectory()`
- `isSymbolicLink()`

### `fs.lstat(filepath, opts?, cb)`

Like `fs.stat` except that paths to symlinks return the symlink stats not the file stats of the symlink's target.

### `fs.symlink(target, filepath, cb)`

Create a symlink at `filepath` that points to `target`.

### `fs.readlink(filepath, opts?, cb)`

Read the target of a symlink.

### `fs.backFile(filepath, opts?, cb)`

Create or change the stat data for a file backed by HTTP.  Size is fetched with a HEAD request.  Useful when using an HTTP backend without `urlauto` set, as then files will only be readable if they have stat data.
Note that stat data is made automatically from the file `/.superblock.txt` if found on the server.  `/.superblock.txt` can be generated or updated with the [included standalone script](src/superblocktxt.js).

Options object:

| Param  | Type [= default] | Description            |
| ------ | ---------------- | ---------------------- |
| `mode` | number = 0o666   | Posix mode permissions |

### `fs.du(filepath, cb)`

Returns the size of a file or directory in bytes.

### `fs.promises`

All the same functions as above, but instead of passing a callback they return a promise.

## Providing a custom `backend` (advanced usage)

There are only two reasons I can think of that you would want to do this:

1. The `fs` module is normally a singleton. LightningFS allows you to safely(ish) hotswap between various data sources by calling `init` multiple times with different options. (It keeps track of file system operations in flight and waits until there's an idle moment to do the switch.)

2. LightningFS normalizes all the lovely variations of node's `fs` arguments:

- `fs.writeFile('filename.txt', 'Hello', cb)`
- `fs.writeFile('filename.txt', 'Hello', 'utf8', cb)`
- `fs.writeFile('filename.txt', 'Hello', { encoding: 'utf8' }, cb)`
- `fs.promises.writeFile('filename.txt', 'Hello')`
- `fs.promises.writeFile('filename.txt', 'Hello', 'utf8')`
- `fs.promises.writeFile('filename.txt', 'Hello', { encoding: 'utf8' })`

And it normalizes filepaths. And will convert plain `StatLike` objects into `Stat` objects with methods like `isFile`, `isDirectory`, etc.

If that fits your needs, then you can provide a `backend` option and LightningFS will use that. Implement as few/many methods as you need for your application to work.

**Note:** If you use a custom backend, you are responsible for managing multi-threaded access - there are no magic mutexes included by default.

Note: throwing an error with the correct `.code` property for any given situation is often important for utilities like `mkdirp` and `rimraf` to work.

```tsx

type EncodingOpts = {
  encoding?: 'utf8';
}

type StatLike = {
  type: 'file' | 'dir' | 'symlink';
  mode: number;
  size: number;
  ino: number | string | BigInt;
  mtimeMs: number;
  ctimeMs?: number;
}

interface IBackend {
  // highly recommended - usually necessary for apps to work
  readFile(filepath: string, opts: EncodingOpts): Awaited<Uint8Array | string>; // throws ENOENT
  writeFile(filepath: string, data: Uint8Array | string, opts: EncodingOpts): void; // throws ENOENT
  unlink(filepath: string, opts: any): void; // throws ENOENT
  readdir(filepath: string, opts: any): Awaited<string[]>; // throws ENOENT, ENOTDIR
  mkdir(filepath: string, opts: any): void; // throws ENOENT, EEXIST
  rmdir(filepath: string, opts: any): void; // throws ENOENT, ENOTDIR, ENOTEMPTY

  // recommended - often necessary for apps to work
  stat(filepath: string, opts: any): Awaited<StatLike>; // throws ENOENT
  lstat(filepath: string, opts: any): Awaited<StatLike>; // throws ENOENT

  // suggested - used occasionally by apps
  rename(oldFilepath: string, newFilepath: string): void; // throws ENOENT
  readlink(filepath: string, opts: any): Awaited<string>; // throws ENOENT
  symlink(target: string, filepath: string): void; // throws ENOENT

  // bonus - not part of the standard `fs` module
  backFile(filepath: string, opts: any): void;
  du(filepath: string): Awaited<number>;

  // lifecycle - useful if your backend needs setup and teardown
  init?(name: string, opts: any): Awaited<void>; // passes initialization options
  activate?(): Awaited<void>; // called before fs operations are started
  deactivate?(): Awaited<void>; // called after fs has been idle for a while
  destroy?(): Awaited<void>; // called before hotswapping backends
}

interface IDB {
  saveSuperblock(superblock): void;
  loadSuperblock(): Awaited<Buffer>;
  readFile(inode): Awaited<Buffer>;
  writeFile(inode, data): Awaited<void>;
  unlink(inode): Awaited<void>;
  wipe(): void;
  close(): void;
}

```

## License

MIT
