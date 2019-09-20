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
      this.socket.binaryType = 'arraybuffer'
      this.socket.addEventListener('open', () => {
        resolve()
      })
      let _nextMessageIsBufferCallback = void 0
      this.socket.addEventListener('message', (event) => {
        if (_nextMessageIsBufferCallback) {
          const { resolve } = _nextMessageIsBufferCallback
          _nextMessageIsBufferCallback = void 0
          return resolve(event.data)
        }
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
            if (retVal && retVal.nextMessageIsBuffer) {
              _nextMessageIsBufferCallback = this._callbacks.get(-id)
            } else {
              this._callbacks.get(-id).resolve(retVal)
            }
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
    if (method === 'writeFile' && typeof args[1] !== 'string') {
      // send as buffer
      this.socket.send(JSON.stringify([this._cbid, method, args[0], { nextMessageIsBuffer: true }, args[2]]))
      this.socket.send(args[1])
    } else {
      this.socket.send(JSON.stringify([this._cbid, method, ...args]))
    }
    return new Promise((resolve, reject) => {
      let e = new Error()
      this._callbacks.set(this._cbid, { resolve, reject, e })
      this._cbid = (this._cbid + 1) % Number.MAX_SAFE_INTEGER
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
    // if (args[1] && args[1].length > 20000) {
    //   return this.bigWrite(args[0], args[1])
    // } else {
      return this.call('writeFile', ...args)
    // }
  }
  async bigWrite(path, body) {
    let dest = this._url.replace('ws://', 'http://') + path
    let res = await fetch(dest, { method: 'POST', body })
    if (res.status !== 201) throw new Error(res.statusText)
  }
  async readFile(...args) {
    // return this.bigRead(...args)
    let data = await this.call('readFile', ...args)
    if (data && data.type && data.type === 'Buffer') {
      data = new Uint8Array(data.data)
    }
    return data
  }
  async bigRead(path, opts = {}) {
    let dest = this._url.replace('ws://', 'http://') + path
    let res = await fetch(dest, { method: 'GET' })
    if (res.status !== 200) throw new Error(res.statusText)
    const data = opts.encoding === 'utf8' ? await res.text() : await res.arrayBuffer()
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
