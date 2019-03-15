const { encode, decode } = require("isomorphic-textencoder");

const Stat = require("./Stat.js");
const CacheFS = require("./CacheFS.js");
const { ENOENT, ENOTEMPTY } = require("./errors.js");
const IdbBackend = require("./IdbBackend.js");
const HttpBackend = require("./HttpBackend.js")

const path = require("./path.js");
const clock = require("./clock.js");

function cleanParams(filepath, opts) {
  // normalize paths
  filepath = path.normalize(filepath);
  // strip out callbacks
  if (typeof opts === "undefined" || typeof opts === "function") {
    opts = {};
  }
  // expand string options to encoding options
  if (typeof opts === "string") {
    opts = {
      encoding: opts,
    };
  }
  return [filepath, opts];
}

function cleanParams2(oldFilepath, newFilepath) {
  // normalize paths
  oldFilepath = path.normalize(oldFilepath);
  newFilepath = path.normalize(newFilepath);
  return [oldFilepath, newFilepath];
}

module.exports = class PromisifiedFS {
  constructor(name, { wipe, url } = {}) {
    this._idb = new IdbBackend(name);
    this._cache = new CacheFS(name);
    this._opts = { wipe, url };
    if (url) {
      this._http = new HttpBackend(url)
    }
    this._initPromise = this._init()
    // YES THIS IS A MESS
    this.readFile = this._wrap(this._readFile.bind(this))
    this.writeFile = this._wrap(this._writeFile.bind(this))
    this.unlink = this._wrap(this._unlink.bind(this))
    this.readdir = this._wrap(this._readdir.bind(this))
    this.mkdir = this._wrap(this._mkdir.bind(this))
    this.rmdir = this._wrap(this._rmdir.bind(this))
    this.rename = this._wrap(this._rename.bind(this))
    this.stat = this._wrap(this._stat.bind(this))
    this.lstat = this._wrap(this._lstat.bind(this))
    this.readlink = this._wrap(this._readlink.bind(this))
    this.symlink = this._wrap(this._symlink.bind(this))
    // Needed so things don't break if you destructure fs and pass individual functions around
    this.readFile = this.readFile.bind(this)
    this.writeFile = this.writeFile.bind(this)
    this.unlink = this.unlink.bind(this)
    this.readdir = this.readdir.bind(this)
    this.mkdir = this.mkdir.bind(this)
    this.rmdir = this.rmdir.bind(this)
    this.rename = this.rename.bind(this)
    this.stat = this.stat.bind(this)
    this.lstat = this.lstat.bind(this)
    this.readlink = this.readlink.bind(this)
    this.symlink = this.symlink.bind(this)
  }
  async _init() {
    if (this._initPromise) return this._initPromise
    if (this._opts.wipe) {
      await this._wipe();
    } else {
      await this._loadSuperblock();
    }
    await this._saveSuperblock();
  }
  async _wipe() {
    await this._idb.wipe()
    if (this._http) {
      const text = await this._http.fetchSuperblock()
      if (text) {
        this._cache.loadSuperBlock(text)
      }
    }
  }
  _saveSuperblock() {
    return this._idb.storeSuperblock(this._cache._root);
  }
  async _loadSuperblock() {
    let root = await this._idb.fetchSuperblock()
    if (!root && this._http) {
      root = await this._http.fetchSuperblock()
    }
    if (root) {
      this._cache.loadSuperBlock(root);
    }
  }
  _wrap (fn) {
    return async (...args) => {
      await this._init()
      await this._loadSuperblock()
      let data, err
      try {
        data = await fn(...args)
      } catch (e) {
        err = e
      }
      await this._saveSuperblock()
      if (err) throw err
      return data
    }
  }
  async _readFile(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { encoding } = opts;
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile');
    const stat = this._cache.stat(filepath);
    let data = await this._idb.readFile(stat.ino)
    if (!data && this._http) {
      data = await this._http.readFile(filepath)
    }
    if (data && encoding === "utf8") {
        data = decode(data);
    }
    return data;
  }
  async _writeFile(filepath, data, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode, encoding = "utf8" } = opts;
    if (typeof data === "string") {
      if (encoding !== "utf8") {
        throw new Error('Only "utf8" encoding is supported in writeFile');
      }
      data = encode(data);
    }
    let stat = this._cache.writeFile(filepath, data, { mode });
    await this._idb.writeFile(stat.ino, data)
    return null
  }
  async _unlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    let stat = this._cache.stat(filepath);
    this._cache.unlink(filepath);
    await this._idb.unlink(stat.ino)
    return null
  }
  async _readdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.readdir(filepath);
    return data
  }
  async _mkdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode = 0o777 } = opts;
    await this._cache.mkdir(filepath, { mode });
    return null
  }
  async _rmdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    this._cache.rmdir(filepath);
    return null;
  }
  async _rename(oldFilepath, newFilepath) {
    ;[oldFilepath, newFilepath] = cleanParams2(oldFilepath, newFilepath);
    this._cache.rename(oldFilepath, newFilepath);
    return null;
  }
  async _stat(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.stat(filepath);
    return new Stat(data);
  }
  async _lstat(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.lstat(filepath);
    return new Stat(data);
  }
  async _readlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    return this._cache.readlink(filepath);
  }
  async _symlink(target, filepath) {
    ;[target, filepath] = cleanParams2(target, filepath);
    this._cache.symlink(target, filepath);
    return null;
  }
}
