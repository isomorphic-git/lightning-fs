const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");

const CacheFS = require("./CacheFS.js");
const { EEXIST, EISDIR, ENOENT, ENOTEMPTY, ETIMEDOUT } = require("./errors.js");
const IdbBackend = require("./IdbBackend.js");
const HttpBackend = require("./HttpBackend.js")
const Mutex = require("./Mutex.js");
const Mutex2 = require("./Mutex2.js");

const path = require("./path.js");

module.exports = class DefaultBackend {
  constructor() {
    this.saveSuperblock = debounce(() => {
      // The tree stays in memory and goes out with the next save
      this.flush().catch(err => console.error(err));
    }, 500);
    // For each path, the last of the calls that change it, which may not
    // have ended yet (see _inTurn).
    this._turns = new Map();
  }
  // Runs fn once the calls before it that change any of these paths have
  // ended, putting the tree back included. Each then finds the tree as the
  // one before it left it, so that what a refused write or deletion puts back
  // is what was there when it started, not what another call left on its way.
  _inTurn(paths, fn) {
    const done = Promise.all(paths.map(p => this._turns.get(p))).then(fn);
    const ended = done.catch(() => {});
    for (const p of paths) this._turns.set(p, ended);
    ended.then(() => {
      for (const p of paths) {
        if (this._turns.get(p) === ended) this._turns.delete(p);
      }
    });
    return done;
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
    uid = 1,
    gid = 1,
  } = {}) {
    this._name = name
    this._idb = db || new IdbBackend(fileDbName, fileStoreName);
    this._mutex = navigator.locks ? new Mutex2(name) : new Mutex(lockDbName, lockStoreName);
    this._cache = new CacheFS(name, { uid, gid });
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
    return this._inTurn([filepath], () => this._store(filepath, data, data.byteLength, mode));
  }
  // Gives filepath an entry, then stores its content. Should the storage
  // refuse the content, the tree goes back to what it was, so that the next
  // save of the tree does not keep an entry whose content was never stored.
  async _store(filepath, data, size, mode) {
    // As writeStat would: the root is a folder (and has no name to look up)
    if (filepath === "/") throw new EISDIR();
    const dir = this._cache._lookup(path.dirname(filepath));
    const name = path.basename(filepath);
    const before = dir.get(name);
    const stat = this._cache.writeStat(filepath, size, { mode });
    const entry = dir.get(name);
    try {
      await this._idb.writeFile(stat.ino, data)
    } catch (err) {
      // Unless a call that reached the file by another path has taken the
      // name meanwhile. The folder goes along when it is renamed, so the
      // entry is still found in it.
      if (dir.get(name) === entry) {
        if (before === undefined) dir.delete(name);
        else dir.set(name, before);
      }
      throw err;
    }
  }
  async unlink(filepath, opts) {
    return this._inTurn([filepath], async () => {
      const stat = this._cache.lstat(filepath);
      const dir = this._cache._lookup(path.dirname(filepath));
      const name = path.basename(filepath);
      const entry = dir.get(name);
      this._cache.unlink(filepath);
      if (stat.type !== 'symlink') {
        this._cache._deleting.add(stat.ino);
        try {
          await this._idb.unlink(stat.ino)
        } catch (err) {
          // As in _store, a deletion the storage refuses leaves the file in
          // the tree, unless the name was taken meanwhile.
          if (!dir.has(name)) dir.set(name, entry);
          throw err;
        } finally {
          this._cache._deleting.delete(stat.ino);
        }
      }
    });
  }
  readdir(filepath, opts) {
    return this._cache.readdir(filepath);
  }
  mkdir(filepath, opts) {
    const { mode = 0o777 } = opts;
    return this._inTurn([filepath], () => this._cache.mkdir(filepath, { mode }));
  }
  rmdir(filepath, opts) {
    // Never allow deleting the root directory.
    if (filepath === "/") {
      throw new ENOTEMPTY();
    }
    return this._inTurn([filepath], () => this._cache.rmdir(filepath));
  }
  rename(oldFilepath, newFilepath) {
    return this._inTurn([oldFilepath, newFilepath], () => this._cache.rename(oldFilepath, newFilepath));
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
    return this._inTurn([filepath], () => this._cache.symlink(target, filepath));
  }
  // These change the entry in place, and so take their turn too: a write
  // refused before them would otherwise put back the entry as it was,
  // without their change.
  chmod(filepath, mode) {
    return this._inTurn([filepath], () => this._cache.chmod(filepath, mode));
  }
  chown(filepath, uid, gid) {
    return this._inTurn([filepath], () => this._cache.chown(filepath, uid, gid));
  }
  utimes(filepath, atime, mtime) {
    return this._inTurn([filepath], () => this._cache.utimes(filepath, atime, mtime));
  }
  lutimes(filepath, atime, mtime) {
    return this._inTurn([filepath], () => this._cache.lutimes(filepath, atime, mtime));
  }
  _exists(filepath) {
    try {
      this._cache.lstat(filepath);
      return true;
    } catch (e) {
      return false;
    }
  }
  _mkdirp(dirpath, mode = 0o777) {
    if (dirpath === "/" || this._exists(dirpath)) return;
    this._mkdirp(path.dirname(dirpath), 0o777);
    try {
      this._cache.mkdir(dirpath, { mode });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  async cp(oldFilepath, newFilepath, opts = {}) {
    const {
      recursive = false,
      force = true,
      errorOnExist = false,
      dereference = false,
      filter,
    } = opts;
    // The root directory contains every path, so it can never be copied
    // into any destination without copying it into itself.
    const isDescendant =
      oldFilepath === "/" ? newFilepath.startsWith("/") : newFilepath.startsWith(oldFilepath + "/");
    if (newFilepath === oldFilepath || isDescendant) {
      throw new Error(`ERR_FS_CP_EINVAL: cannot copy "${oldFilepath}" into itself "${newFilepath}"`);
    }
    await this._cpOne(oldFilepath, newFilepath, { recursive, force, errorOnExist, dereference, filter });
  }
  async _cpOne(src, dest, opts) {
    if (opts.filter && (await opts.filter(src, dest)) === false) return;

    // In turn with the other calls that change either path (see _inTurn), so
    // that src is copied as the calls before left it. The filter runs before,
    // as it may call the file system itself. A folder's entries are listed
    // once this turn has ended, and each takes a turn of its own.
    const srcStat = await this._inTurn([src, dest], () => this._cpEntry(src, dest, opts));
    if (srcStat.type !== "dir") return;
    for (const entry of this._cache.readdir(src)) {
      await this._cpOne(path.join(src, entry), path.join(dest, entry), opts);
    }
  }
  // Copies src to dest, only making the folder if src is one, and returns the
  // stat of src.
  async _cpEntry(src, dest, opts) {
    const srcStat = opts.dereference ? this._cache.stat(src) : this._cache.lstat(src);

    if (srcStat.type === "symlink") {
      if (this._exists(dest)) {
        if (!opts.force) {
          if (opts.errorOnExist) throw new EEXIST(dest);
          return srcStat;
        }
        this._cache.unlink(dest);
      }
      const target = this._cache.readlink(src);
      this._cache.symlink(target, dest);
      return srcStat;
    }

    if (srcStat.type === "dir") {
      if (!opts.recursive) throw new EISDIR(src);
      // Like Node's fs.cp, create any missing destination ancestor directories.
      this._mkdirp(dest, srcStat.mode);
      return srcStat;
    }

    if (this._exists(dest)) {
      // errorOnExist only takes effect when force is false, matching Node's fs.cp.
      if (!opts.force) {
        if (opts.errorOnExist) throw new EEXIST(dest);
        return srcStat;
      }
    }
    // Copy the raw bytes directly from/to the underlying storage, bypassing
    // the utf8 encode/decode that the higher-level readFile/writeFile do.
    const data = await this._idb.readFile(srcStat.ino);
    await this._store(dest, data, srcStat.size, srcStat.mode);
    return srcStat;
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
