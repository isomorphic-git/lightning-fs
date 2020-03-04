const clock = require('./clock.js');
let i = 0;

module.exports = class Mutex {
  constructor(name) {
    this._id = Math.random()
    this._database = name
    this._lock = null
    this._has = false
    this._release = null
  }
  has () {
    return this._has
  }
  // Returns true if successful
  async check () {
    let locks = await navigator.locks.query()
    return locks.held.some(lock => lock.name === `${this._database}_lock` && lock.clientId === this._lock.clientId)
  }
  // Returns true if successful
  async acquire () {
    return new Promise(resolve => {
      navigator.locks.request(this._database + "_lock", {ifAvailable: true}, lock => {
        this._lock = lock
        this._has = !!lock
        resolve(!!lock)
        return new Promise(resolve => {
          this._release = resolve
        })
      }); 
    })
  }
  // check at 10Hz, give up after 10 minutes
  async wait ({ timeout = 600000 } = {}) {
    const controller = new AbortController();
    // Wait at most 200ms.
    setTimeout(() => controller.abort(), timeout);
    const stop = clock(`wait ${i++}`);
    return new Promise(resolve => {
      navigator.locks.request(this._database + "_lock", {signal: controller.signal}, lock => {
        this._lock = lock
        this._has = !!lock
        stop();
        resolve(!!lock)
        return new Promise(resolve => {
          this._release = resolve
        })
      }); 
    })
  }
  // Returns true if successful
  async release ({ force = false } = {}) {
    this._has = false
    this._lock = null
    if (this._release) {
      this._release()
    } else if (force) {
      navigator.locks.request(this._database + "_lock", {steal: true}, lock => true)
    }
  }
}
