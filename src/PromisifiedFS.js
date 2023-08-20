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

module.exports = class PromisifiedFS {
  constructor(name, options = {}) {
    this.init = this.init.bind(this)
    this.readFile = this._wrap(this.readFile, cleanParamsFilepathOpts, false)
    this.writeFile = this._wrap(this.writeFile, cleanParamsFilepathDataOpts, true)
    this.unlink = this._wrap(this.unlink, cleanParamsFilepathOpts, true)
    this.readdir = this._wrap(this.readdir, cleanParamsFilepathOpts, false)
    this.mkdir = this._wrap(this.mkdir, cleanParamsFilepathOpts, true)
    this.rmdir = this._wrap(this.rmdir, cleanParamsFilepathOpts, true)
    this.rename = this._wrap(this.rename, cleanParamsFilepathFilepath, true)
    this.stat = this._wrap(this.stat, cleanParamsFilepathOpts, false)
    this.lstat = this._wrap(this.lstat, cleanParamsFilepathOpts, false)
    this.readlink = this._wrap(this.readlink, cleanParamsFilepathOpts, false)
    this.symlink = this._wrap(this.symlink, cleanParamsFilepathFilepath, true)
    this.backFile = this._wrap(this.backFile, cleanParamsFilepathOpts, true)
    this.du = this._wrap(this.du, cleanParamsFilepathOpts, false);

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
    await this._gracefulShutdown();
    if (this._activationPromise) await this._deactivate()

    if (this._backend && this._backend.destroy) {
      await this._backend.destroy();
    }
    this._backend = options.backend || new DefaultBackend();
    if (this._backend.init) {
      await this._backend.init(name, options);
    }

    if (this._initPromiseResolve) {
      this._initPromiseResolve();
      this._initPromiseResolve = null;
    }
    // The next comment starting with the "fs is initially activated when constructed"?
    // That can create contention for the mutex if two threads try to init at the same time
    // so I've added an option to disable that behavior.
    if (!options.defer) {
      // The fs is initially activated when constructed (in order to wipe/save the superblock)
      // This is not awaited, because that would create a cycle.
      this.stat('/')
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
    if (!this._activationPromise) {
      this._activationPromise = this._backend.activate ? this._backend.activate() : Promise.resolve();
    }
    await this._activationPromise
  }
  async _deactivate() {
    if (this._activationPromise) await this._activationPromise

    if (!this._deactivationPromise) {
      this._deactivationPromise = this._backend.deactivate ? this._backend.deactivate() : Promise.resolve();
    }
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
  async flush() {
    return this._backend.flush();
  }
}
