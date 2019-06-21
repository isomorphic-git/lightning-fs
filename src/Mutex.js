const idb = require("@wmhilton/idb-keyval");

const sleep = ms => new Promise(r => setTimeout(r, ms))

module.exports = class Mutex {
  constructor(name) {
    this._id = Math.random()
    this._database = name
    this._store = new idb.Store(this._database + "_lock", this._database + "_lock")
  }
  snatch () {
    let succeeded
    return idb.update("lockHolder", (current) => {
      succeeded = (current === undefined || current === this.id)
      return succeeded ? this._id : current
    }, this._store)
    .then(() => succeeded)
  }
  async wait (interval = 100, limit = 100) {
    while (limit--) {
      if (await this.snatch()) return true
      await sleep(interval)
    }
    return false
  }
  release (force = false) {
    let succeeded
    return idb.update("lockHolder", (current) => {
      succeeded = force || (current === this._id)
      return succeeded ? void 0 : current
    }, this._store)
    .then(() => succeeded)
  }
}
