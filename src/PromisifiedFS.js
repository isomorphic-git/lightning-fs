const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");

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
    this.saveSuperblock = debounce(() => {
      this._saveSuperblock();
    }, 500);
    if (url) {
      this._http = new HttpBackend(url)
    }
    this._initPromise = this._init()
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
  }
  _wipe() {
    return this._idb.wipe().then(() => {
      if (this._http) {
        return this._http.fetchSuperblock().then(text => {
          if (text) {
            this._cache.loadSuperBlock(text)
          }
        })
      }
     }).then(() => this._saveSuperblock());
  }
  _saveSuperblock() {
    return this._idb.storeSuperblock(this._cache._root);
  }
  _loadSuperblock() {
    return this._idb.fetchSuperblock().then(root => {
      if (root) {
        this._cache.loadSuperBlock(root);
      } else if (this._http) {
        return this._http.fetchSuperblock().then(text => {
          if (text) {
            this._cache.loadSuperBlock(text)
          }
        })
      }
    });
  }
  async readFile(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
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
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode, encoding = "utf8" } = opts;
    if (typeof data === "string") {
      if (encoding !== "utf8") {
        return cb(new Error('Only "utf8" encoding is supported in writeFile'));
      }
      data = encode(data);
    }
    let stat = this._cache.writeFile(filepath, data, { mode });
    await this._idb.writeFile(stat.ino, data)
    await this._saveSuperblock()
    return null
  }
  async unlink(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    let stat = this._cache.stat(filepath);
    this._cache.unlink(filepath);
    await this._idb.unlink(stat.ino)
    await this._saveSuperblock()
    return null
  }
  async readdir(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.readdir(filepath);
    return data
  }
  async mkdir(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode = 0o777 } = opts;
    await this._cache.mkdir(filepath, { mode });
    await this._saveSuperblock()
    return null
  }
  async rmdir(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    this._cache.rmdir(filepath);
    await this._saveSuperblock()
    return null;
  }
  async rename(oldFilepath, newFilepath) {
    await this._init()
    await this._loadSuperblock()
    ;[oldFilepath, newFilepath] = cleanParams2(oldFilepath, newFilepath);
    this._cache.rename(oldFilepath, newFilepath);
    await this._saveSuperblock()
    return null;
  }
  async stat(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.stat(filepath);
    return new Stat(data);
  }
  async lstat(filepath, opts) {
    await this._init()
    await this._loadSuperblock()
    return this.stat(filepath, opts);
  }
  readlink() {}
  symlink() {}
}
