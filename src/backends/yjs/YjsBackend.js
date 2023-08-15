const { encode } = require("isomorphic-textencoder");
const path = require("@stoplight/path");

const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

const TYPE = 't';
const MTIME = 'm';
const MODE = 'o';
const CONTENT = 'c';
const PATH = 'p';
const PARENT = 0;
const BASENAME = 1;

function ID (client, clock) {
  this.client = client;
  this.clock = clock;
}

// https://www.ecma-international.org/ecma-262/#sec-number.prototype.tostring
const MAX_RADIX = 36;

function serializeID (id) {
  // Numbers are encoded in base 36 to save space.
  return `${id.client.toString(MAX_RADIX)}-${id.clock.toString(MAX_RADIX)}`;
}

function parseID (arr) {
  if (!arr) return arr;
  const id = arr.indexOf('-');
  const client = parseInt(arr.slice(0, id), MAX_RADIX);
  const clock = parseInt(arr.slice(id + 1), MAX_RADIX);
  return new ID(client, clock);
}

function sameID (id1, id2) {
  if (id1 == null && id2 == null) return true;
  if (id1 == null || id2 == null) return false;
  return id1.client === id2.client && id1.clock === id2.clock;
}

function ylast (yarr) {
  return yarr.get(yarr.length - 1);
}

function splitPath(path) {
  if (path.length === 0) return [];
  if (path === "/") return ["/"];
  let parts = path.split("/");
  if (parts[parts.length - 1] === '') {
      parts.pop();
  }
  if (path[0] === "/") {
    parts[0] = "/";
  } else {
    if (parts[0] !== ".") {
      parts.unshift(".");
    }
  }
  return parts;
}

module.exports = class YjsBackend {
  constructor(Y, ydoc, find) {
    this.Y = Y;
    this._ydoc = ydoc;
    this._find = find;
    this._inodes = this._ydoc.getArray('!inodes');
    if (this._inodes.length === 0) {
      const rootdir = new this.Y.Map();
      const mtimeMs = Date.now();
      const mode = 0o777;

      rootdir.set(MODE, mode);
      rootdir.set(TYPE, 'dir');
      rootdir.set(MTIME, mtimeMs);
      rootdir.set(CONTENT, true);

      const _path = new this.Y.Array();
      _path.push([[null, '/']]);
      rootdir.set(PATH, _path);
      this._inodes.push([rootdir]);
    }
  }
  async init() {
    return; // TODO: Could connect to server, wait for documents to sync
  }
  async activate() {
    return;
  }
  async deactivate() {
    return;
  }
  async saveSuperblock() {
    return;
  }
  getYTypeByIno(ino) {
    let id = typeof ino === 'string' ? parseID(ino) : ino;
    const item = this._find(this._ydoc.store, id);
    return item.content.type;
  }
  getPathForIno(ino) {
    let id = typeof ino === 'string' ? parseID(ino) : ino;
    const parts = [];
    while (id !== null) {
      const item = this._find(this._ydoc.store, id);
      const map = item.content.type;
      const last = ylast(map.get(PATH));
      parts.unshift(last[BASENAME]);
      id = parseID(last[PARENT]);
    }
    return path.join(...parts);
  }
  _getInode(ino) {
    const id = parseID(ino);
    const item = this._find(this._ydoc.store, id)
    const node = item.content.type;
    return node;
  }
  _childrenOf(id) {
    const children = [];
    for (const value of this._inodes) {
      const last = ylast(value.get(PATH));
      const parent = parseID(last[PARENT]);
      if (parent && sameID(parent, id) && value.get(CONTENT)) children.push(value);
    }
    return children;
  }
  _findChild(id, basename) {
    for (const value of this._inodes) {
      const last = ylast(value.get(PATH));
      const parent = parseID(last[PARENT])
      if (parent && sameID(parent, id) && last[BASENAME] === basename && value.get(CONTENT)) return value;
    }
    return;
  }
  _lookup(filepath, follow = true) {
    let dir = this._inodes.get(0);
    if (filepath === '/') return dir;
    let partialPath = '/'
    let parts = splitPath(filepath)
    // TODO: Actually, given we can reconstruct paths from the bottom up,
    // it might be faster to search by matching against the basepath and then
    // narrowing that set. The problem would be dealing with symlinks.
    for (let i = 1; i < parts.length; i++) {
      let part = parts[i];
      dir = this._findChild(dir._item.id, part);
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
  mkdir(filepath, opts) {
    const { mode = 0o777 } = opts;
    if (filepath === "/") throw new EEXIST();
    let dir = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    for (const child of this._childrenOf(dir._item.id)) {
      const last = ylast(child.get(PATH))
      if (last[BASENAME] === basename) {
        throw new EEXIST();
      }
    }
    const mtimeMs = Date.now();
    this._ydoc.transact(() => {
      let node = new this.Y.Map()
      node.set(MODE, mode);
      node.set(TYPE, 'dir');
      node.set(MTIME, mtimeMs);
      node.set(CONTENT, true); // must be truthy or else directory is in a "deleted" state

      const _path = new this.Y.Array();
      _path.push([[serializeID(dir._item.id), basename]]);
      node.set(PATH, _path);
      this._inodes.push([node]);
    }, 'mkdir');
  }
  rmdir(filepath) {
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    let dir = this._lookup(filepath);
    if (dir.get(TYPE) !== 'dir') throw new ENOTDIR();
    const ino = dir._item.id;
    // check it's empty
    if (this._childrenOf(ino).length > 0) throw new ENOTEMPTY();
    // delete inode
    this._ydoc.transact(() => {
      dir.set(CONTENT, false);
    }, 'rmdir');
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(TYPE) !== 'dir') throw new ENOTDIR();
    return this._childrenOf(dir._item.id).map(node => ylast(node.get(PATH))[BASENAME]);
  }
  writeFile(filepath, data, opts) {
    let { mode, encoding = "utf8" } = opts;
    if (encoding !== "utf8") {
      throw new Error('Only "utf8" encoding is supported in writeFile');
    }
    let node
    try {
      node = this._lookup(filepath);
      if (mode == null) {
        mode = node.get(MODE);
      }
    } catch (err) {}
    if (mode == null) {
      mode = 0o666;
    }
    let newData;
    if (typeof data === "string") {
      // Use a Y.Text
      newData = new this.Y.Text();
      newData.insert(0, data);
    } else if (data instanceof this.Y.AbstractType) {
      newData = data;
    } else {
      // Yjs will fail if data.constructor !== Uint8Array
      if (data.constructor.name === 'Buffer') {
        newData = new Uint8Array(data.buffer);
      } else {
        newData = data;
      }
    }
    this._ydoc.transact(() => {
      if (!node) {
        node = new this.Y.Map();
        node.set(MODE, mode);
        node.set(TYPE, 'file');

        const _path = new this.Y.Array();
        let dir = this._lookup(path.dirname(filepath));
        let parentId = dir._item.id;
        let basename = path.basename(filepath);
        _path.push([[serializeID(parentId), basename]])
        node.set(PATH, _path);
        this._inodes.push([node]);
      } else {
        if (mode !== node.get(MODE)) node.set(MODE, mode);
        node.set(TYPE, 'file');
      }
      const mtimeMs = Date.now();
      node.set(MTIME, mtimeMs);
      node.set(CONTENT, newData);
    }, 'writeFile');
  }
  readFile(filepath, opts) {
    let { encoding } = opts;
    if (encoding && encoding !== "utf8") {
      throw new Error('Only "utf8" encoding is supported in readFile');
    }
    let node = this._lookup(filepath, true);
    let data = node.get(CONTENT);
    if (data instanceof this.Y.Text) {
      data = data.toString();
      if (!encoding) {
        data = encode(data);
      }
    }
    return data;
  }
  unlink(filepath) {
    let node = this._lookup(filepath, false);
    // delete inode
    this._ydoc.transact(() => {
      node.set(CONTENT, false);
    }, 'unlink');
  }
  rename(oldFilepath, newFilepath) {
    // Note: do both lookups before making any changes
    // so if lookup throws, we don't lose data (issue #23)
    // grab references
    let node = this._lookup(oldFilepath);
    let destDir = this._lookup(path.dirname(newFilepath));
    const basename = path.basename(newFilepath);
    // Update parent
    this._ydoc.transact(() => {
      const newParent = serializeID(destDir._item.id);
      node.get(PATH).push([[newParent, basename]]);
    }, 'rename');
  }
  stat(filepath) {
    const node = this._lookup(filepath);
    const stat = {
      mode: node.get(MODE),
      type: node.get(TYPE),
      size: this._size(node),
      mtimeMs: node.get(MTIME),
      ino: serializeID(node._item.id),
    };
    return stat;
  }
  lstat(filepath) {
    const node = this._lookup(filepath, false);
    const stat = {
      mode: node.get(MODE),
      type: node.get(TYPE),
      size: this._size(node),
      mtimeMs: node.get(MTIME),
      ino: serializeID(node._item.id),
    };
    return stat;
  }
  readlink(filepath) {
    return this._lookup(filepath, false).get(CONTENT);
  }
  symlink(target, filepath) {
    let mode, node;
    try {
      node = this._lookup(filepath);
      if (mode === null) {
        mode = node.get(MODE);
      }
    } catch (err) {}
    if (mode == null) {
      mode = 0o120000;
    }
    let dir = this._lookup(path.dirname(filepath));
    let parentId = dir._item.id;
    let basename = path.basename(filepath);
    const mtimeMs = Date.now();

    this._ydoc.transact(() => {
      if (!node) {
        node = new this.Y.Map();
        node.set(MODE, mode);
        node.set(TYPE, 'symlink');
        node.set(MTIME, mtimeMs);
        node.set(CONTENT, target);

        const _path = new this.Y.Array();
        _path.push([[serializeID(parentId), basename]]);
        node.set(PATH, _path);
        this._inodes.push([node]);
      } else {
        node.set(MODE, mode);
        node.set(TYPE, 'symlink');
        node.set(MTIME, mtimeMs);
        node.set(CONTENT, target);
      }
    }, 'symlink');
    const stat = this.lstat(filepath);
    return stat;
  }
  _du (dir) {
    let size = 0;
    const type = dir.get(TYPE)
    if (type === 'file') {
      size += this._size(dir);
    } else if (type === 'dir') {
      for (const entry of this._childrenOf(dir._item.id)) {
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
    let data = node.get(CONTENT)
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
  wipe() {
    return // TODO
  }
  close() {
    return
  }

  _size(node) {
    if (node.get(TYPE) !== 'file') return 0;

    const content = node.get(CONTENT);

    if (content instanceof this.Y.Text || typeof content === 'string') {
      return content.length;
    } else if (content instanceof Uint8Array) {
      return content.byteLength;
    } else {
      return 0;
    }
  }
}
