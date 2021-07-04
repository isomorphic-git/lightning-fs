const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");

const Stat = require("./Stat.js");
const CacheFS = require("./CacheFS.js");
const { ENOENT, ENOTEMPTY, ETIMEDOUT } = require("./errors.js");
const IdbBackend = require("./IdbBackend.js");
const HttpBackend = require("./HttpBackend.js")
const Mutex = require("./Mutex.js");
const Mutex2 = require("./Mutex2.js");

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
  static register(name, backend) {
    if (!this.prototype.backends) this.prototype.backends = {};
    this.prototype.backends[name] = backend;
  }

  static unregister(name) {
    if (this.prototype.backends)
      return delete this.prototype.backends[name];
  }

  constructor(name, options) {
    this.init = this.init.bind(this)
    this.readFile = this._wrap(this.readFile, false)
    this.writeFile = this._wrap(this.writeFile, true)
    this.unlink = this._wrap(this.unlink, true)
    this.readdir = this._wrap(this.readdir, false)
    this.mkdir = this._wrap(this.mkdir, true)
    this.rmdir = this._wrap(this.rmdir, true)
    this.rename = this._wrap(this.rename, true)
    this.stat = this._wrap(this.stat, false)
    this.lstat = this._wrap(this.lstat, false)
    this.readlink = this._wrap(this.readlink, false)
    this.symlink = this._wrap(this.symlink, true)
    this.backFile = this._wrap(this.backFile, true)
    this.du = this._wrap(this.du, false);

    this.saveSuperblock = debounce(() => {
      this._saveSuperblock();
    }, 500);

    this._deactivationPromise = null
    this._deactivationTimeout = null
    this._activationPromise = null

    this._operations = new Set()

    if (name) {
      this.init(name, options)
    }
  }
  async init (...args) {
    if (this._initPromiseResolve) await this._initPromise;
    this._initPromise = this._init(...args)
    return this._initPromise
  }
  async _init (name, options = {}) {
    await this._gracefulShutdown()
    const {
      wipe,
      url,
      urlauto,
      backend,
      fileDbName = name,
      fileStoreName = name + "_files",
      lockDbName = name + "_lock",
      lockStoreName = name + "_lock",
    } = options
    this._name = name
    let Backend = (this.backends && this.backends[backend]) || IdbBackend;
    this._idb = new Backend(fileDbName, {...options, storename: fileStoreName});
    this._mutex = typeof navigator !== 'undefined' && navigator.locks ? new Mutex2(name) : new Mutex(lockDbName, lockStoreName);
    this._cache = new CacheFS(name);
    this._opts = { wipe, url };
    this._needsWipe = !!wipe;
    if (url) {
      this._http = new HttpBackend(url)
      this._urlauto = !!urlauto
    }
    if (this._initPromiseResolve) {
      this._initPromiseResolve();
      this._initPromiseResolve = null;
    }
    // The fs is initially activated when constructed (in order to wipe/save the superblock)
    // This is not awaited, because that would create a cycle.
    this.stat('/')
  }
  async _gracefulShutdown () {
    if (this._operations.size > 0) {
      this._isShuttingDown = true
      await new Promise(resolve => this._gracefulShutdownResolve = resolve);
      this._isShuttingDown = false
      this._gracefulShutdownResolve = null
    }
  }
  _wrap (fn, mutating) {
    let i = 0
    return async (...args) => {
      let op = {
        name: fn.name,
        args,
      }
      this._operations.add(op)
      try {
        await this._activate()
        return await fn.apply(this, args)
      } finally {
        this._operations.delete(op)
        if (mutating) this.saveSuperblock() // this is debounced
        if (this._operations.size === 0) {
          if (!this._deactivationTimeout) clearTimeout(this._deactivationTimeout)
          this._deactivationTimeout = setTimeout(this._deactivate.bind(this), 500)
        }
      }
    }
  }
  async _activate() {
    if (!this._initPromise) console.warn(new Error(`Attempted to use LightningFS ${this._name} before it was initialized.`))
    await this._initPromise
    if (this._deactivationTimeout) {
      clearTimeout(this._deactivationTimeout)
      this._deactivationTimeout = null
    }
    if (this._deactivationPromise) await this._deactivationPromise
    this._deactivationPromise = null
    if (!this._activationPromise) this._activationPromise = this.__activate()
    await this._activationPromise
    if (await this._mutex.has()) {
      return
    } else {
      throw new ETIMEDOUT()
    }
  }
  async __activate() {
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
  }
  async _deactivate() {
    if (this._activationPromise) await this._activationPromise
    if (!this._deactivationPromise) this._deactivationPromise = this.__deactivate()
    this._activationPromise = null
    if (this._gracefulShutdownResolve) this._gracefulShutdownResolve()
    return this._deactivationPromise
  }
  async __deactivate() {
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
  async _writeStat(filepath, size, opts) {
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
    ;[filepath, opts] = cleanParams(filepath, opts);
    const { encoding } = opts;
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
      }
    }
    if (!stat) throw new ENOENT(filepath)
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
    const stat = await this._cache.writeStat(filepath, data.byteLength, { mode });
    await this._idb.writeFile(stat.ino, data)
    return null
  }
  async unlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    const stat = this._cache.lstat(filepath);
    this._cache.unlink(filepath);
    if (stat.type !== 'symlink') {
      await this._idb.unlink(stat.ino)
    }
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
    ;[filepath, opts] = cleanParams(filepath, opts);
    let data = this._cache.lstat(filepath);
    return new Stat(data);
  }
  async readlink(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    return this._cache.readlink(filepath);
  }
  async symlink(target, filepath) {
    ;[target, filepath] = cleanParams2(target, filepath);
    this._cache.symlink(target, filepath);
    return null;
  }
  async backFile(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts);
    let size = await this._http.sizeFile(filepath)
    await this._writeStat(filepath, size, opts)
    return null
  }
  async du(filepath) {
    return this._cache.du(filepath);
  }
}
