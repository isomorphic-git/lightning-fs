const { encode } = require("isomorphic-textencoder");
const { nanoid } = require('nanoid');
const diff = require('fast-diff')

const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

const TYPE = 't';
const MTIME = 'm';
const MODE = 'o';
const CONTENT = 'c';
const SIZE = 'i';
const PARENT = 'p';
const PREVPARENT = '-p';
const BASENAME = 'b';
const PREVBASENAME = '-b';
const DELETED = 'd';

module.exports = class YjsBackend {
  constructor(Y, ydoc) {
    this.Y = Y;
    this._ydoc = ydoc;
    this._inodes = this._ydoc.getMap('!inodes');
    this._content = this._ydoc.getMap('!content');
    if (this._inodes.size === 0) {
      const rootdir = new this.Y.Map();
      const ino = nanoid();
      const mtimeMs = Date.now();
      const mode = 0o777;

      rootdir.set(MODE, mode);
      rootdir.set(TYPE, 'dir');
      rootdir.set(SIZE, 0);
      rootdir.set(MTIME, mtimeMs);

      rootdir.set(PARENT, null);
      rootdir.set(BASENAME, '/');
      this._inodes.set(ino, rootdir);
    }
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
    return filepath;
  }
  _childrenOf(id) {
    const children = [];
    for (const value of this._inodes.values()) {
      if (value.get(PARENT) === id && !value.get(DELETED)) children.push(value);
    }
    return children;
  }
  _findChild(id, basename) {
    const children = [];
    for (const value of this._inodes.values()) {
      if (value.get(PARENT) === id && value.get(BASENAME) === basename && !value.get(DELETED)) return value;
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
      dir = this._findChild(dir && dir._item.parentSub, part);
      if (!dir) throw new ENOENT(filepath);
      // Follow symlinks
      if (follow || i < parts.length - 1) {
        if (dir.get(TYPE) === 'symlink') {
          let target = path.resolve(partialPath, dir.get(CONTENT))
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
    for (const child of this._childrenOf(dir._item.parentSub)) {
      if (child.get(BASENAME) === basename) {
        throw new EEXIST();
      }
    }
    const ino = nanoid();
    const mtimeMs = Date.now();
    this._ydoc.transact(() => {
      let entry = new this.Y.Map()
      entry.set(MODE, mode);
      entry.set(TYPE, 'dir');
      entry.set(SIZE, 0);
      entry.set(MTIME, mtimeMs);

      entry.set(PARENT, dir._item.parentSub);
      entry.set(BASENAME, basename);
      this._inodes.set(ino, entry);
    }, 'mkdir');
  }
  rmdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(TYPE) !== 'dir') throw new ENOTDIR();
    const ino = dir._item.parentSub;
    // check it's empty
    if (this._childrenOf(ino).length > 0) throw new ENOTEMPTY();
    // delete inode
    this._ydoc.transact(() => {
      this._inodes.get(ino).set(DELETED, true);
    }, 'rmdir');
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(TYPE) !== 'dir') throw new ENOTDIR();
    return this._childrenOf(dir._item.parentSub).map(node => node.get(BASENAME));
  }
  writeStat(filepath, size, { mode }) {
    let ino;
    try {
      const node = this._lookup(filepath);
      if (mode == null) {
        mode = node.get(MODE);
      }
      ino = node._item.parentSub;
    } catch (err) {}
    if (mode == null) {
      mode = 0o666;
    }
    if (ino == null) {
      ino = nanoid();
    }
    let dir = this._lookup(path.dirname(filepath));
    let parentId = dir._item.parentSub;
    let basename = path.basename(filepath);
    const mtimeMs = Date.now();

    this._ydoc.transact(() => {
      let entry = this._inodes.get(ino);
      if (!entry) {
        entry = new this.Y.Map();
        entry.set(MODE, mode);
        entry.set(TYPE, 'file');
        entry.set(SIZE, size);
        entry.set(MTIME, mtimeMs);

        entry.set(PARENT, parentId);
        entry.set(BASENAME, basename);
        this._inodes.set(ino, entry);
        this._computePath(ino);
      } else {
        entry.set(MODE, mode);
        entry.set(TYPE, 'file');
        entry.set(SIZE, size);
        entry.set(MTIME, mtimeMs);
      }
    }, 'writeFile');
    const stat = this.stat(filepath);
    return stat;
  }
  unlink(filepath) {
    let node = this._lookup(filepath, false);
    const ino = node._item.parentSub;
    // delete inode
    this._ydoc.transact(() => {
      this._inodes.get(ino).set(DELETED, true);
    }, 'unlink');
  }
  rename(oldFilepath, newFilepath) {
    // Note: do both lookups before making any changes
    // so if lookup throws, we don't lose data (issue #23)
    // grab references
    let node = this._lookup(oldFilepath);
    let destDir = this._lookup(path.dirname(newFilepath));
    // Update parent
    this._ydoc.transact(() => {
      const parent = node.get(PARENT);
      const newParent = destDir._item.parentSub
      if (parent !== newParent) {
        node.set(PARENT, newParent);
        if (node.get(PREVPARENT) !== parent) {
          node.set(PREVPARENT, parent);
        }
      }

      const basename = node.get(BASENAME);
      const newBasename = path.basename(newFilepath);
      if (basename !== newBasename) {
        node.set(BASENAME, newBasename);
        if (node.get(PREVBASENAME) !== basename) {
          node.set(PREVBASENAME, basename);
        }
      }
    }, 'rename');
  }
  stat(filepath) {
    const node = this._lookup(filepath);
    const stat = {
      mode: node.get(MODE),
      type: node.get(TYPE),
      size: node.get(SIZE),
      mtimeMs: node.get(MTIME),
      ino: node._item.parentSub,
    };
    return stat;
  }
  lstat(filepath) {
    const node = this._lookup(filepath, false);
    const stat = {
      mode: node.get(MODE),
      type: node.get(TYPE),
      size: node.get(SIZE),
      mtimeMs: node.get(MTIME),
      ino: node._item.parentSub,
    };
    return stat;
  }
  readlink(filepath) {
    return this._lookup(filepath, false).get(CONTENT);
  }
  symlink(target, filepath) {
    let ino, mode;
    try {
      const node = this._lookup(filepath);
      if (mode === null) {
        mode = node.get(MODE);
      }
      ino = node._item.parentSub;
    } catch (err) {}
    if (mode == null) {
      mode = 0o120000;
    }
    if (ino == null) {
      ino = nanoid();
    }
    let dir = this._lookup(path.dirname(filepath));
    let parentId = dir._item.parentSub;
    let basename = path.basename(filepath);
    const mtimeMs = Date.now();

    this._ydoc.transact(() => {
      let entry = this._inodes.get(ino);
      if (!entry) {
        entry = new this.Y.Map();
        entry.set(MODE, mode);
        entry.set(TYPE, 'symlink');
        entry.set(SIZE, 0);
        entry.set(MTIME, mtimeMs);
        entry.set(CONTENT, target);

        entry.set(PARENT, parentId);
        entry.set(BASENAME, basename);
        this._inodes.set(ino, entry);
        this._computePath(ino);
      } else {
        entry.set(MODE, mode);
        entry.set(TYPE, 'symlink');
        entry.set(SIZE, 0);
        entry.set(MTIME, mtimeMs);
      }
    }, 'symlink');
    const stat = this.lstat(filepath);
    return stat;
  }
  _du (dir) {
    let size = 0;
    const type = dir.get(TYPE)
    if (type === 'file') {
      size += dir.get(SIZE);
    } else if (type === 'dir') {
      for (const entry of this._childrenOf(dir._item.parentSub)) {
        size += this._du(entry);
      }
    }
    return size;
  }
  du (filepath) {
    let dir = this._lookup(filepath);
    return this._du(dir);
  }
  openYType(filepath) {
    let node = this._lookup(filepath, false);
    let data = this._content.get(node._item.parentSub)
    if (data instanceof this.Y.AbstractType) {
      return data;
    }
  }

  saveSuperblock(superblock) {
    return
  }
  loadSuperblock() {
    return
  }
  readFileInode(inode) {
    let data = this._content.get(inode)
    if (data.constructor && data instanceof this.Y.Text) {
      data = encode(data.toString());
    }
    return data;
  }
  writeFileInode(inode, data, rawdata) {
    if (typeof rawdata === 'string') {
      // Update existing Text
      const oldData = this._content.get(inode);
      if (oldData && oldData instanceof this.Y.Text) {
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
        data = new this.Y.Text();
        data.insert(0, rawdata);
      }
    } else if (rawdata instanceof this.Y.AbstractType) {
      data = rawdata;
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
