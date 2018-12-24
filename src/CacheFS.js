const path = require("./path.js");
const { ENOENT, EEXIST, ENOTEMPTY } = require("./errors.js");

const STAT = 0;

module.exports = class CacheFS {
  constructor() {
    this._root = new Map([["/", this._makeRoot()]]);
  }
  _makeRoot(root = new Map()) {
    root.set(STAT, { mode: 0o777, type: "dir", size: 0, mtimeMs: Date.now() });
    return root
  }
  loadSuperBlock(superblock) {
    if (typeof superblock === 'string') {
      this._root = new Map([["/", this._makeRoot(this.parse(superblock))]]);
    } else {
      this._root = superblock
    }
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
    function mk(stat) {
      // TODO: Use a better heuristic for determining whether file or dir
      if (stat.length === 1) {
        let [mode] = stat
        mode = parseInt(mode, 8);
        return new Map([
          [STAT, { mode, type: "dir", size: 0, mtimeMs: Date.now() }]
        ]);
      } else {
        let [mode, size, mtimeMs] = stat;
        mode = parseInt(mode, 8);
        size = parseInt(size);
        mtimeMs = parseInt(mtimeMs);
        return new Map([[STAT, { mode, type: "file", size, mtimeMs }]]);
      }
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
      if (!dir) throw new ENOENT();
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
    let oldStat;
    try {
      oldStat = this.stat(filepath);
    } catch (err) {}
    if (oldStat && mode == null) {
      mode = oldStat.mode;
    } else if (mode == null) {
      mode = 0o666;
    }
    let dir = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    let stat = {
      mode,
      type: "file",
      size: data.length,
      mtimeMs: Date.now(),
    };
    let entry = new Map();
    entry.set(STAT, stat);
    dir.set(basename, entry);
  }
  unlink(filepath) {
    // remove from parent
    let parent = this._lookup(path.dirname(filepath));
    let basename = path.basename(filepath);
    parent.delete(basename);
  }
  stat(filepath) {
    return this._lookup(filepath).get(STAT);
  }
};
