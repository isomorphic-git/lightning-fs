# @isomorphic-git/lightning-fs

A lean and fast 'fs' for the browser

## Motivation

I wanted to see if I could make something faster than [BrowserFS](https://github.com/jvilk/BrowserFS) or [filer](https://github.com/filerjs/filer) that still implements enough of the `fs` API to run the [`isomorphic-git`](https://github.com/isomorphic-git/isomorphic-git) test suite in browsers.

## Comparison with other libraries

This library does not even come close to implementing the full [`fs`](https://nodejs.org/api/fs.html) API.
Instead, it only implements [the subset used by isomorphic-git 'fs' plugin interface](https://isomorphic-git.org/docs/en/plugin_fs).

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
- `mkdir`, `rmdir`, `readdir`, and `stat` are pure in-memory operations that take 0ms
- `writeFile`, `readFile`, and `unlink` are throttled by IndexedDB

The in-memory portion of the filesystem is persisted to IndexedDB with a debounce of 500ms.
The files themselves are not currently cached in memory, because I don't want to waste a lot of memory.
Applications can always *add* an LRU cache on top of `lightning-fs` - if I add one internally and it isn't tuned well for your application, it might be much harder to work around.

## Usage

TODO

## License

MIT