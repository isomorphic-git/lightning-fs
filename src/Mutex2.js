module.exports = class Mutex {
  constructor(name) {
    this._id = Math.random()
    this._database = name
    this._lock = null
    this._has = false
    this._release = null
  }
  async has () {
    return this._has
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
    setTimeout(() => controller.abort(), timeout);
    return new Promise(resolve => {
      navigator.locks.request(this._database + "_lock", {signal: controller.signal}, lock => {
        this._lock = lock
        this._has = !!lock
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
