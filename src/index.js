const once = require("just-once");
const { encode, decode } = require("isomorphic-textencoder");
const debounce = require("just-debounce-it");
const idb = require("idb-keyval");

const path = require("./path.js");
const Stat = require("./Stat.js");
const CacheFS = require("./CacheFS.js");
const { ENOENT, ENOTEMPTY } = require("./errors.js");
const clock = require("./clock.js");

export default class FS {
  constructor(name, { wipe } = {}) {
    this._database = name;
    this._store = new idb.Store(this._database, this._database + "_files");
    this._cache = new CacheFS(name);
    this.saveSuperblock = debounce(() => {
      console.log("saving superblock");
      this._saveSuperblock();
    }, 500);
    if (wipe) {
      this.superblockPromise = this._wipe();
    } else {
      this.superblockPromise = this._loadSuperblock();
    }
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
  _wipe() {
    return idb.clear().then(() => this._saveSuperblock());
  }
  _saveSuperblock() {
    return idb.set("!root", this._cache._root, this._store);
  }
  _loadSuperblock() {
    return idb.get("!root", this._store).then(root => {
      if (root) this._cache._root = root;
    });
  }
  readFile(filepath, opts, cb) {
    const stopClock = clock(`readFile ${filepath}`);
    [filepath, opts, cb] = this._cleanParams(filepath, opts, cb, stopClock);

    const { encoding } = opts;
    this.superblockPromise
      .then(() => {
        try {
          this._cache.stat(filepath);
        } catch (err) {
          return cb(err);
        }
        idb
          .get(filepath, this._store)
          .then(data => {
            if (data) {
              if (encoding === "utf8") {
                data = decode(data);
              } else {
                data = Buffer.from(data);
              }
            }
            cb(null, data);
          })
          .catch(err => {
            console.log("filepath", filepath);
            console.log(err);
            console.log("readFile: stat data out of sync with db");
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
        try {
          this._cache.writeFile(filepath, data, { mode });
        } catch (err) {
          console.log("filepath", filepath);
          console.log(err);
          console.log("writeFile: cache corrupted - unable to keep cache in sync with db");
          return cb(new ENOENT());
        }
        idb
          .set(filepath, data, this._store)
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
        try {
          this._cache.unlink(filepath);
        } catch (err) {
          return cb(err);
        }
        idb
          .del(filepath, this._store)
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
    return this.stat(filepath, opts, cb);
  }
  readlink() {}
  symlink() {}
}
