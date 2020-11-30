const DefaultBackend = require("./DefaultBackend.js");
const Stat = require("./Stat.js");

const path = require("./path.js");

function cleanParamsFilepathOpts(filepath, opts, ...rest) {
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
  return [filepath, opts, ...rest];
}

function cleanParamsFilepathDataOpts(filepath, data, opts, ...rest) {
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
  return [filepath, data, opts, ...rest];
}

function cleanParamsFilepathFilepath(oldFilepath, newFilepath, ...rest) {
  // normalize paths
  return [path.normalize(oldFilepath), path.normalize(newFilepath), ...rest];
}

module.exports = function promises(name, options) {
  const pfs = new PromisifiedFS(options);
  pfs.init = pfs.init.bind(pfs)
  pfs.readFile = pfs._wrap(pfs.readFile, cleanParamsFilepathOpts, false)
  pfs.writeFile = pfs._wrap(pfs.writeFile, cleanParamsFilepathDataOpts, true)
  pfs.unlink = pfs._wrap(pfs.unlink, cleanParamsFilepathOpts, true)
  pfs.readdir = pfs._wrap(pfs.readdir, cleanParamsFilepathOpts, false)
  pfs.mkdir = pfs._wrap(pfs.mkdir, cleanParamsFilepathOpts, true)
  pfs.rmdir = pfs._wrap(pfs.rmdir, cleanParamsFilepathOpts, true)
  pfs.rename = pfs._wrap(pfs.rename, cleanParamsFilepathFilepath, true)
  pfs.stat = pfs._wrap(pfs.stat, cleanParamsFilepathOpts, false)
  pfs.lstat = pfs._wrap(pfs.lstat, cleanParamsFilepathOpts, false)
  pfs.readlink = pfs._wrap(pfs.readlink, cleanParamsFilepathOpts, false)
  pfs.symlink = pfs._wrap(pfs.symlink, cleanParamsFilepathFilepath, true)
  pfs.backFile = pfs._wrap(pfs.backFile, cleanParamsFilepathOpts, true)
  pfs.du = pfs._wrap(pfs.du, cleanParamsFilepathOpts, false);

  if (name) {
    pfs.init(name, options)
  }
  return pfs;
}

class PromisifiedFS {
  constructor(options = {}) {
    this._backend = options.backend || new DefaultBackend();

    this._deactivationPromise = null
    this._deactivationTimeout = null
    this._activationPromise = null

    this._operations = new Set()
  }
  async init (...args) {
    if (this._initPromiseResolve) await this._initPromise;
    this._initPromise = this._init(...args)
    return this._initPromise
  }
  async _init (name, options = {}) {
    await this._gracefulShutdown();

    await this._backend.init(name, options);

    if (this._initPromiseResolve) {
      this._initPromiseResolve();
      this._initPromiseResolve = null;
    }
  }
  async _gracefulShutdown () {
    if (this._operations.size > 0) {
      this._isShuttingDown = true
      await new Promise(resolve => this._gracefulShutdownResolve = resolve);
      this._isShuttingDown = false
      this._gracefulShutdownResolve = null
    }
  }
  _wrap (fn, paramCleaner, mutating) {
    return async (...args) => {
      args = paramCleaner(...args)
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
        if (mutating) this._backend.saveSuperblock() // this is debounced
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
    if (!this._activationPromise) this._activationPromise = this._backend.activate();
    await this._activationPromise
  }
  async _deactivate() {
    if (this._activationPromise) await this._activationPromise
    if (!this._deactivationPromise) this._deactivationPromise = this._backend.deactivate();
    this._activationPromise = null
    if (this._gracefulShutdownResolve) this._gracefulShutdownResolve()
    return this._deactivationPromise
  }
  async readFile(filepath, opts) {
    return this._backend.readFile(filepath, opts);
  }
  async writeFile(filepath, data, opts) {
    await this._backend.writeFile(filepath, data, opts);
    return null
  }
  async unlink(filepath, opts) {
    await this._backend.unlink(filepath, opts);
    return null
  }
  async readdir(filepath, opts) {
    return this._backend.readdir(filepath, opts);
  }
  async mkdir(filepath, opts) {
    await this._backend.mkdir(filepath, opts);
    return null
  }
  async rmdir(filepath, opts) {
    await this._backend.rmdir(filepath, opts);
    return null;
  }
  async rename(oldFilepath, newFilepath) {
    await this._backend.rename(oldFilepath, newFilepath);
    return null;
  }
  async stat(filepath, opts) {
    const data = await this._backend.stat(filepath, opts);
    return new Stat(data);
  }
  async lstat(filepath, opts) {
    const data = await this._backend.lstat(filepath, opts);
    return new Stat(data);
  }
  async readlink(filepath, opts) {
    return this._backend.readlink(filepath, opts);
  }
  async symlink(target, filepath) {
    await this._backend.symlink(target, filepath);
    return null;
  }
  async backFile(filepath, opts) {
    await this._backend.backFile(filepath, opts);
    return null
  }
  async du(filepath) {
    return this._backend.du(filepath);
  }
}
