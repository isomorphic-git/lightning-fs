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
    this._backend = new IdbBackend(name);
    this._cache = new CacheFS(name);
    this.saveSuperblock = debounce(() => {
      this._saveSuperblock();
    }, 500);
    if (url) {
      this._fallback = new HttpBackend(url)
    }
    if (wipe) {
      this.superblockPromise = this._wipe();
    } else {
      this.superblockPromise = this._loadSuperblock();
    }
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
  _wipe() {
    return this._backend.wipe().then(() => {
      if (this._fallback) {
        return this._fallback.loadSuperblock().then(text => {
          if (text) {
            this._cache.loadSuperBlock(text)
          }
        })
      }
     }).then(() => this._saveSuperblock());
  }
  _saveSuperblock() {
    return this._backend.saveSuperblock(this._cache._root);
  }
  _loadSuperblock() {
    return this._backend.loadSuperblock().then(root => {
      if (root) {
        this._cache.loadSuperBlock(root);
      } else if (this._fallback) {
        return this._fallback.loadSuperblock().then(text => {
          if (text) {
            this._cache.loadSuperBlock(text)
          }
        })
      }
    });
  }
  async readFile(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { encoding } = opts;
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile');
    await this.superblockPromise
    const stat = this._cache.stat(filepath);
    let data = await this._backend.readFile(stat.ino)
    if (!data && this._fallback) {
      data = await this._fallback.readFile(filepath)
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
        return cb(new Error('Only "utf8" encoding is supported in writeFile'));
      }
      data = encode(data);
    }
    await this.superblockPromise
    let stat = this._cache.writeFile(filepath, data, { mode });
    await this._backend.writeFile(stat.ino, data)
    return null
  }
  async unlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    await this.superblockPromise
    let stat = this._cache.stat(filepath);
    this._cache.unlink(filepath);
    await this._backend.unlink(stat.ino)
    return null
  }
  async readdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    await this.superblockPromise
    let data = this._cache.readdir(filepath);
    return data
  }
  async mkdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { mode = 0o777 } = opts;
    await this.superblockPromise
    await this._cache.mkdir(filepath, { mode });
    return null
  }
  async rmdir(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    await this.superblockPromise
    this._cache.rmdir(filepath);
    return null;
  }
  async rename(oldFilepath, newFilepath) {
    ;[oldFilepath, newFilepath] = cleanParams2(oldFilepath, newFilepath);
    await this.superblockPromise
    this._cache.rename(oldFilepath, newFilepath);
    return null;
  }
  async stat(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    await this.superblockPromise
    let data = this._cache.stat(filepath);
    return new Stat(data);
  }
  async lstat(filepath, opts) {
    return this.stat(filepath, opts);
  }
  readlink() {}
  symlink() {}
}
