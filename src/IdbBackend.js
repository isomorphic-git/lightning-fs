const idb = require("idb-keyval");

module.exports = class IdbBackend {
  constructor(name) {
    this._database = name;
    this._store = new idb.Store(this._database, this._database + "_files");
  }
  saveSuperblock(superblock) {
    return idb.set("!root", superblock, this._store);
  }
  loadSuperblock() {
    return idb.get("!root", this._store);
  }
  readFile(filepath) {
    return idb.get(filepath, this._store)
  }
  writeFile(filepath, data) {
    return idb.set(filepath, data, this._store)
  }
  unlink(filepath) {
    return idb.del(filepath, this._store)
  }
  wipe() {
    return idb.clear(this._store)
  }
}
