const once = require("just-once");
const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");

const path = require("./path.js");
const Stat = require("./Stat.js");
const CacheFS = require("./CacheFS.js");
const { ENOENT, ENOTEMPTY } = require("./errors.js");
const IdbBackend = require("./IdbBackend.js");
const HttpBackend = require("./HttpBackend.js")
const clock = require("./clock.js");

module.exports = class FS {
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
    this.mkdir = this.mkdir.bind(this)
    this.rmdir = this.rmdir.bind(this)
    this.readdir = this.readdir.bind(this)
    this.rename = this.rename.bind(this)
    this.stat = this.stat.bind(this)
    this.lstat = this.lstat.bind(this)
    this.readlink = this.readlink.bind(this)
    this.symlink = this.symlink.bind(this)
  }
  _cleanParams(filepath, opts, cb, stopClock = null, save = false) {
    filepath = path.normalize(filepath);
    if (typeof opts === "function") {
      cb = opts;
      opts = {};
    }
    if (typeof opts === "string") {
      opts = {
        encoding: opts,
      };
    }
    const _cb = cb;
    cb = once((...args) => {
      if (stopClock) stopClock();
      if (save) this.saveSuperblock();
      _cb(...args);
    });
    return [filepath, opts, cb];
  }
  _cleanParams2(oldFilepath, newFilepath, cb, stopClock = null, save = false) {
    oldFilepath = path.normalize(oldFilepath);
    newFilepath = path.normalize(newFilepath);
    const _cb = cb;
    cb = once((...args) => {
      if (stopClock) stopClock();
      if (save) this.saveSuperblock();
      _cb(...args);
    });
    return [oldFilepath, newFilepath, cb];
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
  readFile(filepath, opts, cb) {
    const stopClock = clock(`readFile ${filepath}`);
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, stopClock);

    const { encoding } = opts;
    this.superblockPromise
      .then(() => {
        let stat
        try {
          stat = this._cache.stat(filepath);
        } catch (err) {
          return cb(err);
        }
        this._backend.readFile(stat.ino)
          .then(data => {
            if (data || !this._fallback) {
              return data
            } else {
              return this._fallback.readFile(filepath)
            }
          })
          .then(data => {
            if (data) {
              if (encoding === "utf8") {
                data = decode(data);
              }
            }
            cb(null, data);
          })
          .catch(err => {
            console.log("ERROR: readFile: stat data out of sync with db:", filepath);
          });
      })
      .catch(cb);
  }
  writeFile(filepath, data, opts, cb) {
    let stop = clock(`writeFile ${filepath}`);
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, stop, true);

    const { mode, encoding = "utf8" } = opts;
    if (typeof data === "string") {
      if (encoding !== "utf8") {
        return cb(new Error('Only "utf8" encoding is supported in writeFile'));
      }
      data = encode(data);
    }
    this.superblockPromise
      .then(() => {
        let stat
        try {
          stat = this._cache.writeFile(filepath, data, { mode });
        } catch (err) {
          return cb(err);
        }
        this._backend.writeFile(stat.ino, data)
          .then(() => cb(null))
          .catch(err => cb(err));
      })
      .catch(cb);
  }
  unlink(filepath, opts, cb) {
    let stop = clock(`unlink ${filepath}`);
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, stop, true);
    this.superblockPromise
      .then(() => {
        let stat
        try {
          stat = this._cache.stat(filepath);
          this._cache.unlink(filepath);
        } catch (err) {
          return cb(err);
        }
        this._backend.unlink(stat.ino)
          .then(() => cb(null))
          .catch(cb);
      })
      .catch(cb);
  }
  readdir(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb);
    this.superblockPromise
      .then(() => {
        try {
          let data = this._cache.readdir(filepath);
          return cb(null, data);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  mkdir(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, null, true);
    const { mode = 0o777 } = opts;
    this.superblockPromise
      .then(() => {
        try {
          this._cache.mkdir(filepath, { mode });
          return cb(null);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  rmdir(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, null, true);
    // Never allow deleting the root directory.
    if (filepath === "/") {
      return cb(new ENOTEMPTY());
    }
    this.superblockPromise
      .then(() => {
        try {
          this._cache.rmdir(filepath);
          return cb(null);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  rename(oldFilepath, newFilepath, cb) {
    [oldFilepath, newFilepath, cb] = this._cleanParams2(oldFilepath, newFilepath, cb, null, true);
    this.superblockPromise
      .then(() => {
        try {
          this._cache.rename(oldFilepath, newFilepath);
          return cb(null);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  stat(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb);
    this.superblockPromise
      .then(() => {
        try {
          let data = this._cache.stat(filepath);
          return cb(null, new Stat(data));
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  lstat(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb);
    this.superblockPromise
      .then(() => {
        try {
          let data = this._cache.lstat(filepath);
          return cb(null, new Stat(data));
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  readlink(filepath, opts, cb) {
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb);
    this.superblockPromise
      .then(() => {
        try {
          let data = this._cache.readlink(filepath);
          return cb(null, data);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
  symlink(target, filepath, cb) {
    [target, filepath, cb] = this._cleanParams2(target, filepath, cb, null, true);
    this.superblockPromise
      .then(() => {
        try {
          this._cache.symlink(target, filepath);
          return cb(null);
        } catch (err) {
          return cb(err);
        }
      })
      .catch(cb);
  }
}
