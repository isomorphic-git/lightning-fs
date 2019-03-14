const idb = require("idb-keyval");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const iam = typeof WorkerGlobalScope === "undefined" ? "main": "worker"

module.exports = class IdbBackend {
  constructor(name) {
    this._database = name;
    this._store = new idb.Store(this._database, this._database + "_files");
    this._saving = null
    this._fetching = null
  }
  async storeSuperblock(superblock) {
    await this._fetching
    if (this._saving) return this._saving
    let done
    this._saving = new Promise(resolve => { done = resolve })
    await idb.set("!root", superblock, this._store);
    await idb.del("!locked", this._store);
    // console.log(`${iam} released lock`)
    done()
    this._saving = null
  }
  async fetchSuperblock() {
    await this._saving
    if (this._fetching) return this._fetching
    let done
    this._fetching = new Promise(resolve => { done = resolve })
    let locked = true
    let call = Math.random()
    while(locked) {
      await idb.update("!locked", value => {
        if (value === undefined) {
          // console.log(`${iam} ${call} grabs the lock`)
        } else {
          // console.log(`${iam} ${call} denied`)
        }
        locked = value
        if (value) {
          return value
        } else {
          return true
        }
      }, this._store);
      if (locked) await sleep(10)
    }
    let root = await idb.get("!root", this._store);
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
