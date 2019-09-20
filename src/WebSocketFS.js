const Stat = require("./Stat.js");

module.exports = class WebSocketFS {
  constructor(url) {
    this._url = url
    this._callbacks = new Map()
    this._cbid = 1
    this._activating

    this.deactivate = this.deactivate.bind(this)
    this.call = this.call.bind(this)
    this.readFile = this.readFile.bind(this)
    this.writeFile = this.writeFile.bind(this)
    this.unlink = this.unlink.bind(this)
    this.readdir = this.readdir.bind(this)
    this.mkdir = this.mkdir.bind(this)
    this.rmdir = this.rmdir.bind(this)
    this.rename = this.rename.bind(this)
    this.stat = this.stat.bind(this)
    this.lstat = this.lstat.bind(this)
    this.readlink = this.readlink.bind(this)
    this.symlink = this.symlink.bind(this)
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
    let data = await this.call('readFile', ...args)
    if (data && data.type && data.type === 'Buffer') {
      data = new Uint8Array(data.data)
    }
    return data
  }
  async unlink(...args) {
    return this.call('unlink', ...args)
  }
  async rename(...args) {
    return this.call('rename', ...args)
  }
  async stat(...args) {
    let data = await this.call('stat', ...args)
    return new Stat(data);
  }
  async lstat(...args) {
    let data = await this.call('lstat', ...args)
    return new Stat(data)
  }
  async readlink(...args) {
    return this.call('readlink', ...args)
  }
  async symlink(...args) {
    return this.call('symlink', ...args)
  }
};
