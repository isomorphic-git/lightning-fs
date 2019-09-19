// const { ENOENT, EEXIST, ENOTEMPTY } = require("./errors.js");
function Err(name) {
  return class extends Error {
    constructor(...args) {
      super(...args);
      this.code = name;
      if (this.message) {
        this.message = name + ": " + this.message;
      } else {
        this.message = name;
      }
    }
  };
}

const EEXIST = Err("EEXIST");
const ENOENT = Err("ENOENT");
const ENOTEMPTY = Err("ENOTEMPTY");

// module.exports = { EEXIST, ENOENT, ENOTEMPTY };

const STAT = 0;

const $ = (...args) => JSON.stringify(args)

export class WebSocketBackend {
  constructor(url) {
    this.url = url
    this.callbacks = new Map()
    this.cbid = 1
  }
  activate() {
    if (this.activated) return
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url)
      this.socket.addEventListener('open', () => {
        resolve()
      })
      this.socket.addEventListener('message', (event) => {
        let vals = JSON.parse(event.data)
        console.log(vals)
        let [id, retVal, errVal] = vals
        if (id < 0) {
          if (errVal) {
            let cb = this.callbacks.get(-id)
            if (!cb) return
            let [name, message] = errVal
            cb.e.code = name
            cb.e.name = name
            cb.e.message = message
            cb.reject(cb.e)
          } else {
            this.callbacks.get(-id).resolve(retVal)
          }
        }
      })
    })
  }
  get activated () {
    return this.socket && this.socket.readyState === 1
  }
  deactivate () {
    this.socket.close()
  }
  call (method, ...args) {
    this.socket.send(JSON.stringify([this.cbid, method, ...args]))
    return new Promise((resolve, reject) => {
      let e = new Error()
      this.callbacks.set(this.cbid, { resolve, reject, e })
      this.cbid++
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
