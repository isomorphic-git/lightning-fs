const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY, EISDIR } = require("./errors.js");

const STAT = 0;

module.exports = class CacheFS {
  constructor(name, { uid = 1, gid = 1 } = {}) {
    this._uid = uid;
    this._gid = gid;
  }
  _makeRoot(root = new Map()) {
    root.set(STAT, { mode: 0o777, type: "dir", size: 0, ino: 0, mtimeMs: Date.now(), uid: this._uid, gid: this._gid });
    return root
  }
  activate(superblock = null) {
    if (superblock === null) {
      this._root = new Map([["/", this._makeRoot()]]);
    } else if (typeof superblock === 'string') {
      this._root = new Map([["/", this._makeRoot(this.parse(superblock))]]);
    } else {
      this._root = superblock
    }
  }
  get activated () {
    return !!this._root
  }
  deactivate () {
    this._root = void 0
  }
  size () {
    // subtract 1 to ignore the root directory itself from the count.
    return this._countInodes(this._root.get("/")) - 1;
  }
  _countInodes(map) {
    let count = 1;
    for (let [key, val] of map) {
      if (key === STAT) continue;
      count += this._countInodes(val);
    }
    return count;
  }
  autoinc () {
    let val = this._maxInode(this._root.get("/")) + 1;
    return val;
  }
  _maxInode(map) {
    let max = map.get(STAT).ino;
    for (let [key, val] of map) {
      if (key === STAT) continue;
      max = Math.max(max, this._maxInode(val));
    }
    return max;
  }
  print(root = this._root.get("/")) {
    let str = "";
    const printTree = (root, indent) => {
      for (let [file, node] of root) {
        if (file === 0) continue;
        let stat = node.get(STAT);
        let mode = stat.mode.toString(8);
        str += `${"\t".repeat(indent)}${file}\t${mode}`
        if (stat.type === "file") {
          str += `\t${stat.size}\t${stat.mtimeMs}\n`;
        } else {
          str += `\n`
          printTree(node, indent + 1);
        }
      }
    };
    printTree(root, 0);
    return str;
  }
  parse(print) {
    let autoinc = 0;
    const uid = this._uid;
    const gid = this._gid;

    function mk(stat) {
      const ino = ++autoinc;
      // TODO: Use a better heuristic for determining whether file or dir
      const type = stat.length === 1 ? "dir" : "file"
      let [mode, size, mtimeMs] = stat;
      mode = parseInt(mode, 8);
      size = size ? parseInt(size) : 0;
      mtimeMs = mtimeMs ? parseInt(mtimeMs) : Date.now();
      return new Map([[STAT, { mode, type, size, mtimeMs, ino, uid, gid }]]);
    }

    let lines = print.trim().split("\n");
    let _root = this._makeRoot();
    let stack = [
      { indent: -1, node: _root },
      { indent: 0, node: null }
    ];
    for (let line of lines) {
      let prefix = line.match(/^\t*/)[0];
      let indent = prefix.length;
      line = line.slice(indent);
      let [filename, ...stat] = line.split("\t");
      let node = mk(stat);
      if (indent <= stack[stack.length - 1].indent) {
        while (indent <= stack[stack.length - 1].indent) {
          stack.pop();
        }
      }
      stack.push({ indent, node });
      let cd = stack[stack.length - 2].node;
      cd.set(filename, node);
    }
    return _root;
  }
  _lookup(filepath, follow = true) {
    let dir = this._root;
    let partialPath = '/'
    let parts = path.split(filepath)
    for (let i = 0; i < parts.length; ++ i) {
      let part = parts[i];
      dir = dir.get(part);
      if (!dir) throw new ENOENT(filepath);
      // Follow symlinks
      if (follow || i < parts.length - 1) {
        const stat = dir.get(STAT)
        if (stat.type === 'symlink') {
          // Targets are stored verbatim, so they may still contain '.', '..'
          // or repeated slashes. path.resolve only normalizes relative paths,
          // so an absolute target has to be normalized here before lookup.
          let target = path.normalize(path.resolve(partialPath, stat.target))
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
    let entry = new Map();
    let stat = {
      mode,
      type: "dir",
      size: 0,
      mtimeMs: Date.now(),
      ino: this.autoinc(),
      uid: this._uid,
      gid: this._gid,
    };
    entry.set(STAT, stat);
    dir.set(basename, entry);
  }
  rmdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    // check it's empty (size should be 1 for just StatSym)
    if (dir.size > 1) throw new ENOTEMPTY();
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    parent.delete(basename);
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    if (dir.get(STAT).type !== 'dir') throw new ENOTDIR();
    return [...dir.keys()].filter(key => typeof key === "string");
  }
  writeStat(filepath, size, { mode }) {
    let ino, uid, gid;
    let oldStat;
    try {
      oldStat = this.stat(filepath);
    } catch (err) {}

    if (oldStat !== undefined) {
      if (oldStat.type === 'dir') {
        throw new EISDIR();
      }

      if (mode == null) {
        mode = oldStat.mode;
      }
      uid = oldStat.uid;
      gid = oldStat.gid;
      ino = oldStat.ino;
    }

    if (mode == null) {
      mode = 0o666;
    }
    if (uid == null) {
      uid = this._uid;
    }
    if (gid == null) {
      gid = this._gid;
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
      uid,
      gid,
    };
    let entry = new Map();
    entry.set(STAT, stat);
    dir.set(basename, entry);
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
    // insert into new parent directory
    destDir.set(basename, entry);
    // remove from old parent directory
    this.unlink(oldFilepath)
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
    const uid = this._uid, gid = this._gid;
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
      uid,
      gid,
    };
    let entry = new Map();
    entry.set(STAT, stat);
    dir.set(basename, entry);
    return stat;
  }
  chmod(filepath, mode) {
    let stat = this.stat(filepath);
    stat.mode = mode;
    stat.ctimeMs = Date.now();
  }
  chown(filepath, uid, gid) {
    let stat = this.stat(filepath);
    stat.uid = uid;
    stat.gid = gid;
    stat.ctimeMs = Date.now();
  }
  _du (dir) {
    let size = 0;
    for (const [name, entry] of dir.entries()) {
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
};
