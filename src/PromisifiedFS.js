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
  return [path.normalize(oldFilepath), path.normalize(newFilepath)];
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
    // Wrap each function call in a lock transaction
    this.readFile = this._wrap(this.readFile)
    this.writeFile = this._wrap(this.writeFile)
    this.unlink = this._wrap(this.unlink)
    this.readdir = this._wrap(this.readdir)
    this.mkdir = this._wrap(this.mkdir)
    this.rmdir = this._wrap(this.rmdir)
    this.rename = this._wrap(this.rename)
    this.stat = this._wrap(this.stat)
    this.lstat = this._wrap(this.lstat)
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
    fn = fn.bind(this)
    return async (...args) => {
      await this._init()
      await this._loadSuperblock()
      try {
        return await fn(...args)
      } catch (err) {
        throw err
      } finally {
        await this._saveSuperblock()
      }
    }
  }
  _overrideLock () {
    return this._idb.overrideLock()
  }
  async readFile(filepath, opts) {
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
  async writeFile(filepath, data, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode, encoding = "utf8" } = opts;
    if (typeof data === "string") {
      if (encoding !== "utf8") {
        throw new Error('Only "utf8" encoding is supported in writeFile');
      }
      data = encode(data);
    }
    const stat = this._cache.writeFile(filepath, data, { mode });
    await this._idb.writeFile(stat.ino, data)
    return null
  }
  async unlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const stat = this._cache.stat(filepath);
    this._cache.unlink(filepath);
    await this._idb.unlink(stat.ino)
    return null
  }
  async readdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    return this._cache.readdir(filepath);
  }
  async mkdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode = 0o777 } = opts;
    await this._cache.mkdir(filepath, { mode });
    return null
  }
  async rmdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    this._cache.rmdir(filepath);
    return null;
  }
  async rename(oldFilepath, newFilepath) {
    ;[oldFilepath, newFilepath] = cleanParams2(oldFilepath, newFilepath);
    this._cache.rename(oldFilepath, newFilepath);
    return null;
  }
  async stat(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const data = this._cache.stat(filepath);
    return new Stat(data);
  }
  async lstat(filepath, opts) {
    return this.stat(filepath, opts);
  }
  readlink() {}
  symlink() {}
}
