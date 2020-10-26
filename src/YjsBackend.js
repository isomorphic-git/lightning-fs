const Y = require('yjs');
const { IndexeddbPersistence } = require('y-indexeddb');

const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

const STAT = '!STAT';
const DATA = '!DATA';

module.exports = class YjsBackend {
  constructor(name) {
    this._ydoc = new Y.Doc();
    this._yidb = new IndexeddbPersistence(name + '_yjs', this._ydoc);
    this._ready = this._yidb.whenSynced.then(async () => {
      this._root = this._ydoc.getMap('!root');
      this._inodes = this._ydoc.getMap('!inodes');
      if (!this._root.has("/")) {
        const root = new Y.Map();
        root.set(STAT, { mode: 0o777, type: "dir", size: 0, ino: 0, mtimeMs: Date.now() });
        this._inodes.set('0', root);
        this._root.set("/", '0');
      }
      return 'ready';
    });
  }
  get activated () {
    return !!this._root
  }
  autoinc () {
    let val = this._maxInode(this._inodes.get("0")) + 1;
    return val;
  }
  _maxInode(map) {
    let max = map.get(STAT).ino;
    for (let [key, ino] of map) {
      if (key === STAT) continue;
      if (key === DATA) continue;
      const val = this._inodes.get(String(ino));
      if (!val.get) continue;
      max = Math.max(max, this._maxInode(val));
    }
    return max;
  }
  _lookup(filepath, follow = true) {
    let dir = this._root;
    let partialPath = '/'
    let parts = path.split(filepath)
    for (let i = 0; i < parts.length; ++ i) {
      let part = parts[i];
      const ino = dir.get(part);
      dir = this._inodes.get(String(ino));
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
    const ino = this.autoinc();
    let entry = new Y.Map()
    let stat = {
      mode,
      type: "dir",
      size: 0,
      mtimeMs: Date.now(),
      ino,
    };
    entry.set(STAT, stat);
    this._inodes.set(String(ino), entry);
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
      ino = this.autoinc();
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
    this._inodes.set(String(ino), entry);
    return stat;
  }
  unlink(filepath) {
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    parent.delete(basename);
  }
  rename(oldFilepath, newFilepath) {
    let basename = path.basename(newFilepath);
    // Note: do both lookups before making any changes
    // so if lookup throws, we don't lose data (issue #23)
    // grab references
    let entry = this._lookup(oldFilepath);
    let destDir = this._lookup(path.dirname(newFilepath));
    // remove from old parent directory
    this.unlink(oldFilepath)
    // insert into new parent directory
    // TODO: THIS DOESN'T WORK IN YJS (must use New fresh Y.Map object?)
    destDir.set(basename, entry);
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
      ino = this.autoinc();
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
    this._inodes.set(String(ino), entry);
    return stat;
  }
  _du (dir) {
    let size = 0;
    for (const [name, ino] of dir.entries()) {
      const entry = this._inodes.get(String(ino));
      if (name === STAT) {
        size += entry.size;
      } else {
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
    return this._inodes.get(String(inode)).get(DATA);
  }
  writeFileInode(inode, data) {
    return this._inodes.get(String(inode)).set(DATA, data);
  }
  unlinkInode(inode) {
    return this._inodes.delete(inode)
  }
  wipe() {
    return [...this._root.keys()].map(key => this._root.delete(key))
  }
  close() {
    return
  }
}
