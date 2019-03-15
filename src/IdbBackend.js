const idb = require("@wmhilton/idb-keyval");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const iam = typeof WorkerGlobalScope === "undefined" ? "main": "worker"

module.exports = class IdbBackend {
  constructor(name) {
    this._database = name;
    this._store = new idb.Store(this._database, this._database + "_files");
    this._saving = null
    this._fetching = null
    this._timeout
  }
  async overrideLock () {
    return idb.del("!locked", this._store);
  }
  async storeSuperblock(superblock) {
    this._cache = superblock
    await this._fetching
    clearTimeout(this._timeout)
    this._timeout = setTimeout(async () => {
      let done
      this._saving = new Promise(resolve => { done = resolve })
      this._cache = null
      await idb.set("!root", superblock, this._store);
      await idb.del("!locked", this._store);
      this._saving = null
      done()
    }, 500)
  }
  async fetchSuperblock() {
    await this._saving
    if (this._fetching) return this._fetching
    if (this._cache) return this._cache
    let done
    this._fetching = new Promise(resolve => { done = resolve })
    let locked = true
    while(locked) {
      await idb.update("!locked", value => {
        if (value) {
          // auto-expire locks after 24 hours
          if (value < (new Date().valueOf() - 24 * 60 * 60 * 1000)) {
            value = undefined
          }
        }
        locked = value
        if (value) {
          return value
        } else {
          return new Date().valueOf()
        }
      }, this._store);
      if (locked) await sleep(10)
    }
    let root = await idb.get("!root", this._store);
    this._cache = root
    done(root)
    this._fetching = null
    return root
  }
  readFile(inode) {
    return idb.get(inode, this._store)
  }
  writeFile(inode, data) {
    return idb.set(inode, data, this._store)
  }
  unlink(inode) {
    return idb.del(inode, this._store)
  }
  wipe() {
    return idb.clear(this._store)
  }
}
