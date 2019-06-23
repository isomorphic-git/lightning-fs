const idb = require("@wmhilton/idb-keyval");

const sleep = ms => new Promise(r => setTimeout(r, ms))

module.exports = class Mutex {
  constructor(name) {
    this._id = Math.random()
    this._database = name
    this._store = new idb.Store(this._database + "_lock", this._database + "_lock")
    this._has = false
    this._holdingInterval = null
  }
  has () {
    return this._has
  }
  // Returns true if successful
  async snatch () {
    let success
    let doubleLock
    await idb.update("lockHolder", (current) => {
      success = current === undefined
      doubleLock = current === this._id
      this._has = success || doubleLock
      return success ? this._id : current
    }, this._store)
    if (doubleLock) {
      console.trace('Mutex double-locked')
      throw new Error('Mutex double-locked')
    }
    return success
  }
  async wait (interval = 100, limit = 100) {
    while (limit--) {
      if (await this.snatch()) return true
      await sleep(interval)
    }
    throw new Error('Mutex timeout')
  }
  // Returns true if successful
  async release (force = false) {
    let success
    let doubleFree
    let someoneElseHasIt
    await idb.update("lockHolder", (current) => {
      success = force || (current === this._id)
      doubleFree = current === void 0
      someoneElseHasIt = current !== this._id
      this._has = !success
      return success ? void 0 : current
    }, this._store)
    if (!success && !force) {
      if (doubleFree) throw new Error('Mutex double-freed')
      if (someoneElseHasIt) throw new Error('Mutex lost ownership')
    }
    return success
  }
}
