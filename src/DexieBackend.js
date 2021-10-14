const { Dexie } = require("dexie");

module.exports = class DexieBackend {
  constructor(dbname, storename) {
    const stores = {};
    stores[storename] = "";
    this._dexie = new Dexie(dbname);
    this._dexie.version(1).stores(stores);
    this._storename = storename;
  }
  async saveSuperblock(superblock) {
    await this._dexie.open();
    return this._dexie[this._storename].put(superblock, "!root");
  }
  async loadSuperblock() {
    await this._dexie.open();
    return this._dexie[this._storename].get("!root");
  }
  async readFile(inode) {
    await this._dexie.open();
    return this._dexie[this._storename].get(inode);
  }
  async readFileBulk(inodeBulk) {
    await this._dexie.open();
    return this._dexie[this._storename].bulkGet(inodeBulk);
  }
  async writeFile(inode, data) {
    await this._dexie.open();
    return this._dexie[this._storename].put(data, inode);
  }
  async writeFileBulk(inodeBulk, dataBulk) {
    await this._dexie.open();
    return this._dexie[this._storename].bulkPut(dataBulk, inodeBulk);
  }
  async unlink(inode) {
    await this._dexie.open();
    return this._dexie[this._storename].delete(inode);
  }
  async unlinkBulk(inodeBulk) {
    await this._dexie.open();
    return this._dexie[this._storename].bulkDelete(inodeBulk);
  }
  async wipe() {
    await this._dexie.open();
    return this._dexie[this._storename].clear();
  }
  async close() {
    return this._dexie.close();
  }
};
