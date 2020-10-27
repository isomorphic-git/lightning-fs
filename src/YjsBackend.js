const Y = require('yjs');
const { IndexeddbPersistence } = require('y-indexeddb');
// const { WebsocketProvider } = require('y-websocket');
const { v4: uuidv4 } = require('uuid');

const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

// ':' is invalid as a filename character on both Mac and Windows, so these shouldn't conflict with real filenames.
// I can still totally see our own code failing to reject ':' when renaming a file though.
// So for safety, I'm adding NULL because NULL is invalid as a filename character on Linux. And pretty impossible to type using a keyboard.
// So that should handle ANY conceivable craziness.
const STAT = ':S\0';

module.exports = class YjsBackend {
  constructor(name) {
    this._ydoc = new Y.Doc();
    this._yidb = new IndexeddbPersistence(name + '_yjs', this._ydoc);
    // WIP: I'm adding this to get the BroadcastChannel functionality for the threadsafety tests can run.
    // this._yws = new WebsocketProvider('wss://demos.yjs.dev', name + '_yjs', this._ydoc, { connect: false });
    this._ready = this._yidb.whenSynced.then(async () => {
      this._root = this._ydoc.getMap('!root');
      this._inodes = this._ydoc.getMap('!inodes');
      this._content = this._ydoc.getMap('!content');
      if (!this._root.has("/")) {
        const root = new Y.Map();
        const ino = uuidv4();
        root.set(STAT, { mode: 0o777, type: "dir", size: 0, ino, mtimeMs: Date.now() });
        this._inodes.set(ino, root);
        this._root.set("/", ino);
      }
      // this._yws.connectBc();
      return 'ready';
    });
  }
  get activated () {
    return !!this._root
  }
  _lookup(filepath, follow = true) {
    let dir = this._root;
    let partialPath = '/'
    let parts = path.split(filepath)
    for (let i = 0; i < parts.length; ++ i) {
      let part = parts[i];
      const ino = dir.get(part);
      dir = this._inodes.get(ino);
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
    let basename = path.basename(filepath);
    if (dir.has(basename)) {
      throw new EEXIST();
    }
    const ino = uuidv4();
    let entry = new Y.Map()
    let stat = {
      mode,
      type: "dir",
      size: 0,
      mtimeMs: Date.now(),
      ino,
    };
    entry.set(STAT, stat);
    this._inodes.set(ino, entry);
    dir.set(basename, ino);
  }
  rmdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    // check it's empty (size should be 1 for just StatSym)
    if (dir.size > 1) throw new ENOTEMPTY();
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    const ino = parent.get(basename)
    parent.delete(basename);
    this._inodes.delete(ino);
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    return [...dir.keys()].filter(key => key != STAT);
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
      ino = uuidv4();
    }
    let dir = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    let stat = {
      mode,
      type: "file",
      size,
      mtimeMs: Date.now(),
      ino,
    };
    let entry = new Y.Map();
    entry.set(STAT, stat);
    dir.set(basename, ino);
    this._inodes.set(ino, entry);
    return stat;
  }
  unlink(filepath) {
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    parent.delete(basename);
  }
  rename(oldFilepath, newFilepath) {
    let oldBasename = path.basename(oldFilepath);
    let newBasename = path.basename(newFilepath);
    // Note: do both lookups before making any changes
    // so if lookup throws, we don't lose data (issue #23)
    // grab references
    let entry = this._lookup(path.dirname(oldFilepath));
    let destDir = this._lookup(path.dirname(newFilepath));
    let ino = entry.get(oldBasename);
    // insert into new parent directory
    destDir.set(newBasename, ino)
    // remove from old parent directory
    entry.delete(oldBasename)
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
      ino = uuidv4();
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
    let entry = new Y.Map();
    entry.set(STAT, stat);
    dir.set(basename, ino);
    this._inodes.set(ino, entry);
    return stat;
  }
  _du (dir) {
    let size = 0;
    for (const [name, ino] of dir.entries()) {
      if (name === STAT) {
        size += ino.size;
      } else {
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
    return this._content.get(inode);
  }
  writeFileInode(inode, data) {
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
