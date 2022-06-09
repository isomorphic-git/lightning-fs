const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");

const CacheFS = require("./CacheFS.js");
const { ENOENT, ENOTEMPTY, ETIMEDOUT } = require("./errors.js");
const IdbBackend = require("./IdbBackend.js");
const HttpBackend = require("./HttpBackend.js")
const Mutex = require("./Mutex.js");
const Mutex2 = require("./Mutex2.js");

const path = require("./path.js");

module.exports = class DefaultBackend {
  constructor() {
    this.saveSuperblock = debounce(() => {
      this.flush();
    }, 500);
  }
  async init (name, {
    wipe,
    url,
    urlauto,
    fileDbName = name,
    db = null,
    fileStoreName = name + "_files",
    lockDbName = name + "_lock",
    lockStoreName = name + "_lock",
  } = {}) {
    this._name = name
    this._idb = db || new IdbBackend(fileDbName, fileStoreName);
    this._mutex = navigator.locks ? new Mutex2(name) : new Mutex(lockDbName, lockStoreName);
    this._cache = new CacheFS(name);
    this._opts = { wipe, url };
    this._needsWipe = !!wipe;
    if (url) {
      this._http = new HttpBackend(url)
      this._urlauto = !!urlauto
    }
  }
  async activate() {
    if (this._cache.activated) return
    // Wipe IDB if requested
    if (this._needsWipe) {
      this._needsWipe = false;
      await this._idb.wipe()
      await this._mutex.release({ force: true })
    }
    if (!(await this._mutex.has())) await this._mutex.wait()
    // Attempt to load FS from IDB backend
    const root = await this._idb.loadSuperblock()
    if (root) {
      this._cache.activate(root);
    } else if (this._http) {
      // If that failed, attempt to load FS from HTTP backend
      const text = await this._http.loadSuperblock()
      this._cache.activate(text)
      await this._saveSuperblock();
    } else {
      // If there is no HTTP backend, start with an empty filesystem
      this._cache.activate()
    }
    if (await this._mutex.has()) {
      return
    } else {
      throw new ETIMEDOUT()
    }
  }
  async deactivate() {
    if (await this._mutex.has()) {
      await this._saveSuperblock()
    }
    this._cache.deactivate()
    try {
      await this._mutex.release()
    } catch (e) {
      console.log(e)
    }
    await this._idb.close()
  }
  async _saveSuperblock() {
    if (this._cache.activated) {
      this._lastSavedAt = Date.now()
      await this._idb.saveSuperblock(this._cache._root);
    }
  }
  _writeStat(filepath, size, opts) {
    let dirparts = path.split(path.dirname(filepath))
    let dir = dirparts.shift()
    for (let dirpart of dirparts) {
      dir = path.join(dir, dirpart)
      try {
        this._cache.mkdir(dir, { mode: 0o777 })
      } catch (e) {}
    }
    return this._cache.writeStat(filepath, size, opts)
  }
  async readFile(filepath, opts) {
    const encoding = typeof opts === "string" ? opts : opts && opts.encoding;
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile');
    let data = null, stat = null
    try {
      stat = this._cache.stat(filepath);
      data = await this._idb.readFile(stat.ino)
    } catch (e) {
      if (!this._urlauto) throw e
    }
    if (!data && this._http) {
      let lstat = this._cache.lstat(filepath)
      while (lstat.type === 'symlink') {
        filepath = path.resolve(path.dirname(filepath), lstat.target)
        lstat = this._cache.lstat(filepath)
      }
      data = await this._http.readFile(filepath)
    }
    if (data) {
      if (!stat || stat.size != data.byteLength) {
        stat = await this._writeStat(filepath, data.byteLength, { mode: stat ? stat.mode : 0o666 })
        this.saveSuperblock() // debounced
      }
      if (encoding === "utf8") {
        data = decode(data);
      } else {
        data.toString = () => decode(data);
      }
    }
    if (!stat) throw new ENOENT(filepath)
    return data;
  }
  async writeFile(filepath, data, opts) {
    const { mode, encoding = "utf8" } = opts;
    if (typeof data === "string") {
      if (encoding !== "utf8") {
        throw new Error('Only "utf8" encoding is supported in writeFile');
      }
      data = encode(data);
    }
    const stat = await this._cache.writeStat(filepath, data.byteLength, { mode });
    await this._idb.writeFile(stat.ino, data)
  }
  async unlink(filepath, opts) {
    const stat = this._cache.lstat(filepath);
    this._cache.unlink(filepath);
    if (stat.type !== 'symlink') {
      await this._idb.unlink(stat.ino)
    }
  }
  readdir(filepath, opts) {
    return this._cache.readdir(filepath);
  }
  mkdir(filepath, opts) {
    const { mode = 0o777 } = opts;
    this._cache.mkdir(filepath, { mode });
  }
  rmdir(filepath, opts) {
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    this._cache.rmdir(filepath);
  }
  rename(oldFilepath, newFilepath) {
    this._cache.rename(oldFilepath, newFilepath);
  }
  stat(filepath, opts) {
    return this._cache.stat(filepath);
  }
  lstat(filepath, opts) {
    return this._cache.lstat(filepath);
  }
  readlink(filepath, opts) {
    return this._cache.readlink(filepath);
  }
  symlink(target, filepath) {
    this._cache.symlink(target, filepath);
  }
  async backFile(filepath, opts) {
    let size = await this._http.sizeFile(filepath)
    await this._writeStat(filepath, size, opts)
  }
  du(filepath) {
    return this._cache.du(filepath);
  }
  flush() {
    return this._saveSuperblock();
  }
}
