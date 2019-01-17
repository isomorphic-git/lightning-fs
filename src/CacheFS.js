const path = require("./path.js");
const { ENOENT, EEXIST, ENOTEMPTY } = require("./errors.js");

const STAT = 0;

module.exports = class CacheFS {
  constructor() {
    this._root = new Map([["/", this._makeRoot()]]);
  }
  _makeRoot(root = new Map()) {
    root.set(STAT, { mode: 0o777, type: "dir", size: 0, ino: 0, mtimeMs: Date.now() });
    return root
  }
  loadSuperBlock(superblock) {
    if (typeof superblock === 'string') {
      this._root = new Map([["/", this._makeRoot(this.parse(superblock))]]);
    } else {
      this._root = superblock
    }
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

    function mk(stat) {
      const ino = ++autoinc;
      // TODO: Use a better heuristic for determining whether file or dir
      const type = stat.length === 1 ? "dir" : "file"
      let [mode, size, mtimeMs] = stat;
      mode = parseInt(mode, 8);
      size = size ? parseInt(size) : 0;
      mtimeMs = mtimeMs ? parseInt(mtimeMs) : Date.now();
      return new Map([[STAT, { mode, type, size, mtimeMs, ino }]]);
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
  _lookup(filepath) {
    let dir = this._root;
    for (let part of path.split(filepath)) {
      dir = dir.get(part);
      if (!dir) throw new ENOENT(filepath);
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
    };
    entry.set(STAT, stat);
    dir.set(basename, entry);
  }
  rmdir(filepath) {
    // check it's empty (size should be 1 for just StatSym)
    if (this._lookup(filepath).size > 1) throw new ENOTEMPTY();
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    parent.delete(basename);
  }
  readdir(filepath) {
    let dir = this._lookup(filepath);
    return [...dir.keys()].filter(key => typeof key === "string");
  }
  writeFile(filepath, data, { mode }) {
    let ino;
    try {
      let oldStat = this.stat(filepath);
      if (mode === null) {
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
      size: data.length,
      mtimeMs: Date.now(),
      ino,
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
    // grab reference
    let entry = this._lookup(oldFilepath);
    // remove from parent directory
    this.unlink(oldFilepath)
    // insert into new parent directory
    let dir = this._lookup(path.dirname(newFilepath));
    let basename = path.basename(newFilepath);
    dir.set(basename, entry);
  }
  stat(filepath) {
    return this._lookup(filepath).get(STAT);
  }
};
