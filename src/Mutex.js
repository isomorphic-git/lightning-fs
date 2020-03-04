const idb = require("@isomorphic-git/idb-keyval");

const clock = require('./clock.js');
let i = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms))

module.exports = class Mutex {
  constructor(name) {
    this._id = Math.random()
    this._database = name
    this._store = new idb.Store(this._database + "_lock", this._database + "_lock")
    this._has = false
    this._keepAliveTimeout = null
    this._expires = 0
  }
  has () {
    return this._has
  }
  // Returns true if successful
  async check () {
    const now = Date.now()
    if (this._has && this._expires > now) {
      return true
    } else {
      const current = await idb.get("lock", this._store)
      return current && current.holder === this._id
    }
  }
  // Returns true if successful
  async acquire ({ ttl = 5000, refreshPeriod } = {}) {
    let success
    let expired
    let doubleLock
    await idb.update("lock", (current) => {
      const now = Date.now()
      const expires = now + ttl
      expired = current && current.expires < now
      success = current === undefined || expired
      doubleLock = current && current.holder === this._id
      this._has = success || doubleLock
      this._expires = expires
      return success ? { holder: this._id, expires } : current
    }, this._store)
    if (doubleLock) {
      throw new Error('Mutex double-locked')
    }
    if (success) {
      this._keepAlive({ ttl, refreshPeriod })
    }
    return success
  }
  // check at 10Hz, give up after 10 minutes
  async wait ({ interval = 100, limit = 6000, ttl, refreshPeriod } = {}) {
    const stop = clock(`wait ${i++}`);
    while (limit--) {
      if (await this.acquire({ ttl, refreshPeriod })) {
        stop();
        return true
      }
      await sleep(interval)
    }
    stop();
    throw new Error('Mutex timeout')
  }
  // Returns true if successful
  async release ({ force = false } = {}) {
    let success
    let doubleFree
    let someoneElseHasIt
    this._stopKeepAlive()
    this._expires = 0
    const stop = clock(`release ${i++}`);
    await idb.update("lock", (current) => {
      success = force || (current && current.holder === this._id)
      doubleFree = current === void 0
      someoneElseHasIt = current && current.holder !== this._id
      this._has = !success
      return success ? void 0 : current
    }, this._store)
    await idb.close(this._store)
    stop();
    if (!success && !force) {
      if (doubleFree) throw new Error('Mutex double-freed')
      if (someoneElseHasIt) throw new Error('Mutex lost ownership')
    }
    return success
  }
  // Note: Chrome throttles & batches timers in background tabs to 1Hz,
  // so there's not much point in having a refreshPeriod shorter than 1000.
  // And TTL obviously needs to be greater than refreshPeriod.
  async _keepAlive ({ ttl = 5000, refreshPeriod = 3000 } = {}) {
    performance.mark(`_keepAlive ${i++}`);
    const keepAliveFn = async () => {
      const stop = clock(`keepAliveFn ${i++}`);
      let success
      let someoneDeletedIt
      let someoneElseHasIt
      await idb.update("lock", (current) => {
        const now = Date.now()
        someoneDeletedIt = current === void 0
        someoneElseHasIt = current && current.holder !== this._id
        success = !someoneDeletedIt && !someoneElseHasIt
        this._has = success
        return success ? { holder: this._id, expires: now + ttl } : current
      }, this._store)
      stop();
      if (!success) this._stopKeepAlive()
      if (someoneDeletedIt) throw new Error('Mutex was deleted')
      if (someoneElseHasIt) throw new Error('Mutex lost ownership')
    }
    this._keepAliveTimeout = setInterval(keepAliveFn, refreshPeriod)
  }
  _stopKeepAlive () {
    if (this._keepAliveTimeout) {
      clearInterval(this._keepAliveTimeout)
    }
  }
}
