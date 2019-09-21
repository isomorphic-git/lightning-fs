const path = require("./path.js");
const Stat = require("./Stat.js");
const { ENOENT, EEXIST, ENOTEMPTY } = require("./errors.js");

function cleanParams(filepath, opts = {}) {
  // normalize paths
  filepath = path.normalize(filepath);
  // expand string options to encoding options
  if (typeof opts === "string") {
    opts = {
      encoding: opts,
    };
  }
  return [filepath, opts];
}

module.exports = class NativeFS {
  constructor(name, opts = {}) {
    this._name = name
    this._root = new Promise(async (resolve, reject) => {
      if (opts.nativeDirectoryHandle) {
        return resolve(opts.nativeDirectoryHandle)
      } else if (opts.nativeSandbox) {
        let dh = await FileSystemDirectoryHandle.getSystemDirectory({ type: 'sandbox' })
        return resolve(dh)
      } else {
        this._readyCallback = { resolve, reject }
      }
    })
    this._lookupDir = this._lookupDir.bind(this)
    this._lookupFile = this._lookupFile.bind(this)
    this._lookupUnknown = this._lookupUnknown.bind(this)
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
  async openDirectory () {
    let root = await window.chooseFileSystemEntries({ type: 'openDirectory' })
    this._readyCallback.resolve(root)
  }
  async _lookupDir(filepath) {
    let dir = await this._root;
    const parts = path.split(filepath)
    if (parts[0] === '/') parts.shift()
    if (parts[0] === '.') parts.shift()
    for (let part of parts) {
      try {
        dir = await dir.getDirectory(part);
      } catch (e) {
        throw new ENOENT(filepath);
      }
    }
    return dir;
  }
  async _lookupFile(filepath) {
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir  = await this._lookupDir(dirname)
    try {
      const fh = await (await dir.getFile(basename)).getFile()
      return fh
    } catch (e) {
      throw new ENOENT(filepath)
    }
  }
  async _lookupUnknown(filepath) {
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const parent = await this._lookupDir(dirname)
    try {
      const dir = await parent.getDirectory(basename)
      return ['dir', dir]
    } catch (e) {
      let file
      try {
        file = await parent.getFile(basename)
      } catch (e) {
        throw new ENOENT(filepath)
      }
      const fh = await file.getFile()
      return ['file', fh]
    }
  }
  async mkdir(filepath) {
    filepath = path.normalize(filepath)
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    let exists = false
    try {
      await dir.getDirectory(basename, { create: false })
      exists = true
    } catch (e) {
      exists = false
    } finally {
      if (exists) {
        throw new EEXIST(filepath)
      } else {
        await dir.getDirectory(basename, { create: true })
      }
    }
  }
  async rmdir(filepath, opts = {}) {
    let { recursive = false } = opts
    filepath = path.normalize(filepath)
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    try {
      await dir.getDirectory(basename)
    } catch (e) {
      throw new ENOENT(filepath)
    }
    try {
      await dir.removeEntry(basename, { recursive })
    } catch (e) {
      if (!recursive) {
        throw new ENOTEMPTY(filepath)
      } else {
        throw e
      }
    }
  }
  async readdir(filepath) {
    filepath = path.normalize(filepath);
    const dir = await this._lookupDir(filepath)
    const entries = dir.getEntries()
    let names = []
    for await (let entry of entries) {
      names.push(entry.name)
    }
    return names
  }
  async writeFile(filepath, data, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts)
    const { encoding } = opts
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile')
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    const fh = await dir.getFile(basename, { create: true })
    const writer = await fh.createWriter();
    await writer.truncate(0);
    await writer.write(0, data);
    await writer.close();
  }
  async readFile(filepath, opts) {
    ;[filepath, opts] = cleanParams(filepath, opts)
    const { encoding } = opts
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile')
    const fh = await this._lookupFile(filepath)
    if (encoding === 'utf8') {
      return fh.text()
    } else {
      return fh.arrayBuffer()
    }
  }
  async unlink(filepath) {
    filepath = path.normalize(filepath)
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    try {
      await dir.getFile(basename)
    } catch (e) {
      throw new ENOENT(filepath)
    }
    await dir.removeEntry(basename)
  }
  async rename(...args) {
    return this.call('rename', ...args)
  }
  async stat(filepath) {
    filepath = path.normalize(filepath);
    let [type, h] = await this._lookupUnknown(filepath)
    return new Stat({
      type,
      mode: 0o644, // make something up
      size: h.size,
      ino: 1,
      mtimeMs: h.lastModified,
      ctimeMs: h.lastModified,
      uid: 1,
      gid: 1,
      dev: 1,
    })
  }
  async lstat(...args) {
    return this.stat(...args)
  }
  async readlink() {
    throw new Error("NativeFS doesn't support symlinks.")
  }
  async symlink(...args) {
    throw new Error("NativeFS doesn't support symlinks.")
  }
};
