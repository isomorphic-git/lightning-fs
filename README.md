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

## Usage

### `new FS(name, opts?)`
First, create or open a "filesystem". (The name is used to determine the IndexedDb store name.)

```
import FS from '@isomorphic-git/lightning-fs';

const fs = new FS("testfs")
```

Options object:

| Param  | Type [= default]   | Description                                                           |
| ------ | ------------------ | --------------------------------------------------------------------- |
| `wipe` | boolean = false    | Delete the database and start with an empty filesystem                |
| `url`  | string = undefined | Let `readFile` requests fall back to an HTTP request to this base URL |

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

The callback return value is an Array of strings.

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

### `fs.promises`

All the same functions as above, but instead of passing a callback they return a promise.

## License

MIT