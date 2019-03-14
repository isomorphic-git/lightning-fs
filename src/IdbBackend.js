const idb = require("idb-keyval");

module.exports = class IdbBackend {
  constructor(name) {
    this._database = name;
    this._store = new idb.Store(this._database, this._database + "_files");
    this._saving = Promise.resolve()
    this._fetching = Promise.resolve()
  }
  async storeSuperblock(superblock) {
    await this._fetching
    let done
    this._saving = new Promise(resolve => { done = resolve })
    await idb.set("!root", superblock, this._store);
    await idb.del("!locked", this._store);
    done()
  }
  async fetchSuperblock() {
    await this._saving
    let done
    this._fetching = new Promise(resolve => { done = resolve })
    let locked = true
    await idb.update("!locked", value => {
      locked = value
      if (value) {
        return value
      } else {
        return true
      }
    }, this._store);
    let root = await idb.get("!root", this._store);
    done()
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
