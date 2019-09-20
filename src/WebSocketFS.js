module.exports = class WebSocketFS {
  constructor(url) {
    this._url = url
    this._callbacks = new Map()
    this._cbid = 1
    this._activating
  }
  activate() {
    if (this.activated) return
    if (this._activating) return this._activating
    this._activating = new Promise((resolve, reject) => {
      this.socket = new WebSocket(this._url)
      this.socket.addEventListener('open', () => {
        resolve()
      })
      this.socket.addEventListener('message', (event) => {
        let vals = JSON.parse(event.data)
        console.log(vals)
        let [id, retVal, errVal] = vals
        if (id < 0) {
          if (errVal) {
            let cb = this._callbacks.get(-id)
            if (!cb) return
            let [name, message] = errVal
            cb.e.code = name
            cb.e.name = name
            cb.e.message = message
            cb.reject(cb.e)
          } else {
            this._callbacks.get(-id).resolve(retVal)
          }
        }
      })
    })
    return this._activating
  }
  get activated () {
    return this.socket && this.socket.readyState === 1
  }
  deactivate () {
    this.socket.close()
  }
  async call (method, ...args) {
    await this.activate()
    this.socket.send(JSON.stringify([this._cbid, method, ...args]))
    return new Promise((resolve, reject) => {
      let e = new Error()
      this._callbacks.set(this._cbid, { resolve, reject, e })
      this._cbid++
    })
  }
  async mkdir(...args) {
    return this.call('mkdir', ...args)
  }
  async rmdir(...args) {
    return this.call('rmdir', ...args)
  }
  async readdir(...args) {
    return this.call('readdir', ...args)
  }
  async writeFile(...args) {
    return this.call('writeFile', ...args)
  }
  async readFile(...args) {
    return this.call('readFile', ...args)
  }
  async unlink(...args) {
    return this.call('unlink', ...args)
  }
  async rename(...args) {
    return this.call('rename', ...args)
  }
  async stat(...args) {
    return this.call('stat', ...args)
  }
  async lstat(...args) {
    return this.call('lstat', ...args)
  }
  async readlink(...args) {
    return this.call('readlink', ...args)
  }
  async symlink(...args) {
    return this.call('symlink', ...args)
  }
};
