const { encode, decode } = require("isomorphic-textencoder");
const Y = require('yjs');
const { IndexeddbPersistence } = require('y-indexeddb');
const { WebsocketProvider } = require('y-websocket');
const { nanoid } = require('nanoid');
const diff = require('fast-diff')

const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

// ':' is invalid as a filename character on both Mac and Windows, so these shouldn't conflict with real filenames.
// I can still totally see our own code failing to reject ':' when renaming a file though.
// So for safety, I'm adding NULL because NULL is invalid as a filename character on Linux. And pretty impossible to type using a keyboard.
// So that should handle ANY conceivable craziness.
const STAT = 's';
const CHILDREN = 'c';
const PARENT = 'p';
const BASENAME = 'b';

module.exports = class YjsBackend {
  constructor(name) {
    this._ydoc = new Y.Doc();
    this._yidb = new IndexeddbPersistence(name + '_yjs', this._ydoc);
    // WIP: I'm adding this to get the BroadcastChannel functionality for the threadsafety tests can run.
    this._yws = new WebsocketProvider('wss://demos.yjs.dev', 'stoplight-v0.0.1-' + name + '_yjs', this._ydoc, { connect: false });
    this._ready = this._yidb.whenSynced.then(async () => {
      this._inodes = this._ydoc.getMap('!inodes');
      this._content = this._ydoc.getMap('!content');
      this._ino2path = {};
      this._path2ino = {};
      if (this._inodes.size === 0) {
        const rootdir = new Y.Map();
        const ino = nanoid();
        rootdir.set(STAT, { mode: 0o777, type: "dir", size: 0, ino, mtimeMs: Date.now() });
        rootdir.set(PARENT, null);
        rootdir.set(BASENAME, '/');
        this._inodes.set(ino, rootdir);
      }
      for (const ino of this._inodes.keys()) {
        this._computePath(ino);
      }
      console.log(JSON.stringify(this._ino2path, null, 2))
      this._yws.connectBc();
      return 'ready';
    });
  }
  get activated () {
    return !!this._root
  }
  _computePath(ino) {
    let parts = [];
    while (ino != null) {
      const dir = this._inodes.get(ino)
      if (!dir) break;
      parts.unshift(dir.get(BASENAME))
      ino = dir.get(PARENT)
    }
    const filepath = path.join(parts);
    this._ino2path[ino] = filepath;
    this._path2ino[filepath] = ino;
    return filepath;
  }
  _childrenOf(id) {
    const children = [];
    for (const value of this._inodes.values()) {
      if (value.get(PARENT) === id) children.push(value);
    }
    return children;
  }
  _findChild(id, basename) {
    const children = [];
    for (const value of this._inodes.values()) {
      if (value.get(PARENT) === id && value.get(BASENAME) === basename) return value;
    }
    return;
  }
  _lookup(filepath, follow = true) {
    let dir = null;
    let partialPath = '/'
    let parts = path.split(filepath)
    // TODO: Actually, given we can reconstruct paths from the bottom up,
    // it might be faster to search by matching against the basepath and then
    // narrowing that set. The problem would be dealing with symlinks.
    for (let i = 0; i < parts.length; ++ i) {
      let part = parts[i];
      dir = this._findChild(dir && dir.get(STAT).ino, part);
      if (!dir) throw new ENOENT(filepath);
      // Follow symlinks
      if (follow || i < parts.length - 1) {
        const stat = dir.get(STAT)
        if (stat.type === 'symlink') {
          let target = path.resolve(partialPath, stat.target)
          dir = this._lookup(target)
        }
        if (!partialPath) {
          partialPath = part
        } else {
          partialPath = path.join(partialPath, part)
        }
      }
    }
    return dir;
  }
  mkdir(filepath, { mode }) {
    if (filepath === "/") throw new EEXIST();
    let dir = this._lookup(path.dirname(filepath));
    console.log('dir', JSON.stringify(dir.toJSON()));
    console.log('ino', dir.get(STAT).ino);
    let basename = path.basename(filepath);
    for (const child of this._childrenOf(dir.get(STAT).ino)) {
      if (child.get(BASENAME) === basename) {
        throw new EEXIST();
      }
    }
    const ino = nanoid();
    let stat = {
      mode,
      type: "dir",
      size: 0,
      mtimeMs: Date.now(),
      ino,
    };
    this._ydoc.transact(() => {
      let entry = new Y.Map()
      entry.set(STAT, stat);
      entry.set(PARENT, dir.get(STAT).ino);
      entry.set(BASENAME, basename);
      this._inodes.set(ino, entry);
    }, 'mkdir');
    console.log(JSON.stringify(this._inodes.toJSON(), null, 2));
  }
  rmdir(filepath) {
    let dir = this._lookup(filepath);
    console.log('dir', dir.toJSON());
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    const ino = dir.get(STAT).ino;
    // check it's empty
    if (this._childrenOf(ino).length > 0) throw new ENOTEMPTY();
    console.log('its empty');
    // remove from cache
    delete this._ino2path[ino];
    delete this._path2ino[filepath];
    // delete inode
    this._ydoc.transact(() => {
      this._inodes.delete(ino);
    }, 'rmdir');
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    return this._childrenOf(dir.get(STAT).ino).map(node => node.get(BASENAME));
  }
  writeStat(filepath, size, { mode }) {
    let ino;
    try {
      let oldStat = this.stat(filepath);
      if (mode == null) {
        mode = oldStat.mode;
      }
      ino = oldStat.ino;
    } catch (err) {}
    if (mode == null) {
      mode = 0o666;
    }
    if (ino == null) {
      ino = nanoid();
    }
    let dir = this._lookup(path.dirname(filepath));
    let parentId = dir.get(STAT).ino;
    let basename = path.basename(filepath);
    let stat = {
      mode,
      type: "file",
      size,
      mtimeMs: Date.now(),
      ino,
      filepath,
    };
    this._ydoc.transact(() => {
      let entry = this._inodes.get(ino);
      if (!entry) {
        entry = new Y.Map();
        entry.set(STAT, stat);
        entry.set(PARENT, parentId);
        entry.set(BASENAME, basename);
        this._inodes.set(ino, entry);
        this._computePath(ino);
      } else {
        entry.set(STAT, stat);
      }
    }, 'writeFile');
    return stat;
  }
  unlink(filepath) {
    let node = this._lookup(filepath);
    // remove from cache
    delete this._ino2path[ino];
    delete this._path2ino[filepath];
    // delete inode
    const ino = node.get(STAT).ino;
    this._ydoc.transact(() => {
      this._inodes.delete(ino);
    }, 'unlink');
  }
  rename(oldFilepath, newFilepath) {
    let oldBasename = path.basename(oldFilepath);
    let newBasename = path.basename(newFilepath);
    // Note: do both lookups before making any changes
    // so if lookup throws, we don't lose data (issue #23)
    // grab references
    let srcDir = this._lookup(path.dirname(oldFilepath));
    let destDir = this._lookup(path.dirname(newFilepath));
    let ino = srcDir.get(CHILDREN).get(oldBasename);
    const entry = this._inodes.get(ino);
    const stat = entry.get(STAT);
    this._ydoc.transact(() => {
      // insert into new parent directory
      destDir.get(CHILDREN).set(newBasename, ino)
      // remove from old parent directory
      srcDir.get(CHILDREN).delete(oldBasename)
      // update stat.path
      stat.filepath = newFilepath;
      entry.set(STAT, stat);
    }, 'rename');
  }
  stat(filepath) {
    return this._lookup(filepath).get(STAT);
  }
  lstat(filepath) {
    return this._lookup(filepath, false).get(STAT);
  }
  readlink(filepath) {
    return this._lookup(filepath, false).get(STAT).target;
  }
  symlink(target, filepath) {
    let ino, mode;
    try {
      let oldStat = this.stat(filepath);
      if (mode === null) {
        mode = oldStat.mode;
      }
      ino = oldStat.ino;
    } catch (err) {}
    if (mode == null) {
      mode = 0o120000;
    }
    if (ino == null) {
      ino = nanoid();
    }
    let dir = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    let stat = {
      mode,
      type: "symlink",
      target,
      size: 0,
      mtimeMs: Date.now(),
      ino,
    };
    this._ydoc.transact(() => {
      let entry = new Y.Map();
      entry.set(STAT, stat);
      this._inodes.set(ino, entry);
      dir.get(CHILDREN).set(basename, ino);
    }, 'symlink');
    return stat;
  }
  _du (dir) {
    let size = 0;
    const stat = dir.get(STAT)
    if (stat.type === 'file') {
      size += stat.size;
    } else if (stat.type === 'dir') {
      for (const [name, ino] of dir.get(CHILDREN).entries()) {
        const entry = this._inodes.get(ino);
        size += this._du(entry);
      }
    }
    return size;
  }
  du (filepath) {
    let dir = this._lookup(filepath);
    return this._du(dir);
  }

  saveSuperblock(superblock) {
    return
  }
  loadSuperblock() {
    return
  }
  readFileInode(inode) {
    let data = this._content.get(inode)
    if (data instanceof Y.Text) {
      data = encode(data.toString());
    }
    return data;
  }
  writeFileInode(inode, data, rawdata) {
    if (typeof rawdata === 'string') {
      // Update existing Text
      const oldData = this._content.get(inode);
      if (oldData && oldData instanceof Y.Text) {
        const oldString = oldData.toString();
        const changes = diff(oldString, rawdata);
        let idx = 0;
        for (const [kind, string] of changes) {
          switch (kind) {
            case diff.EQUAL: {
              idx += string.length;
              break;
            }
            case diff.DELETE: {
              oldData.delete(idx, string.length)
              break;
            }
            case diff.INSERT: {
              oldData.insert(idx, string);
              idx += string.length;
              break;
            }
          }
        }
        return;
      } else {
        // Use new Y.Text
        data = new Y.Text();
        data.insert(0, rawdata);
      }
    } else {
      // Yjs will fail if data.constructor !== Uint8Array
      if (data.constructor.name === 'Buffer') {
        data = new Uint8Array(data.buffer);
      }
    }
    return this._content.set(inode, data);
  }
  unlinkInode(inode) {
    return this._content.delete(inode)
  }
  wipe() {
    return [...this._root.keys()].map(key => this._root.delete(key))
  }
  close() {
    return
  }
}
