const printTree = require("print-tree");

const path = require("./path.js");
const { ENOENT, EEXIST, ENOTEMPTY } = require("./errors.js");

const STAT = 0;

module.exports = class CacheFS {
  constructor() {
    let root = new Map();
    let stat = { mode: 0o777, type: "dir", size: 0, mtimeMs: Date.now() };
    root.set(STAT, stat);
    this._root = new Map([["/", root]]);
  }
  _print() {
    const root = [...this._root.entries()][0];
    return printTree(
      root,
      node => {
        let stat = node[1].get(STAT);
        let mode = stat.mode.toString(8);
        if (stat.type === "file") {
          return `${node[0]} [mode=${mode} size=${stat.size} mtime=${stat.mtimeMs}]`;
        } else {
          return `${node[0]} [mode=${mode}]`;
        }
      },
      node => {
        if (node[1] === null) {
          // it's a file
          return [];
        } else {
          // it's a dir
          return [...node[1].entries()].filter(([key]) => typeof key === "string");
        }
      }
    );
  }
  _lookup(filepath) {
    let dir = this._root;
    for (let part of path.split(filepath)) {
      dir = dir.get(part);
      if (!dir) throw new ENOENT();
    }
    return dir;
  }
  // _mkdirp(filepath) {
  //   let dir = this._root;
  //   let traversing = true;
  //   let tmp;
  //   for (let part of path.split(filepath)) {
  //     if (traversing) {
  //       tmp = dir.get(part);
  //       if (tmp) {
  //         dir = tmp;
  //       } else {
  //         traversing = false;
  //       }
  //     }
  //     if (!traversing) {
  //       tmp = new Map();
  //       dir.set(part, tmp);
  //       dir = tmp;
  //     }
  //   }
  //   return dir;
  // }
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
