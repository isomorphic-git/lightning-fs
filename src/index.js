const once = require("just-once");

const PromisifiedFS = require('./PromisifiedFS');

function wrapCallback (opts, cb) {
  if (typeof opts === "function") {
    cb = opts;
  }
  cb = once(cb);
  const resolve = (...args) => cb(null, ...args)
  return [resolve, cb];
}

module.exports = class FS {
  constructor(...args) {
    this.promises = new PromisifiedFS(...args)
    // Needed so things don't break if you destructure fs and pass individual functions around
    this.init = this.init.bind(this)
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
    this.backFile = this.backFile.bind(this)
    this.du = this.du.bind(this)
    this.flush = this.flush.bind(this)
  }
  init(name, options) {
    return this.promises.init(name, options)
  }
  readFile(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.readFile(filepath, opts).then(resolve).catch(reject)
  }
  writeFile(filepath, data, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.writeFile(filepath, data, opts).then(resolve).catch(reject);
  }
  unlink(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.unlink(filepath, opts).then(resolve).catch(reject);
  }
  readdir(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.readdir(filepath, opts).then(resolve).catch(reject);
  }
  mkdir(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.mkdir(filepath, opts).then(resolve).catch(reject)
  }
  rmdir(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.rmdir(filepath, opts).then(resolve).catch(reject)
  }
  rename(oldFilepath, newFilepath, cb) {
    const [resolve, reject] = wrapCallback(cb);
    this.promises.rename(oldFilepath, newFilepath).then(resolve).catch(reject)
  }
  stat(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.stat(filepath).then(resolve).catch(reject);
  }
  lstat(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.lstat(filepath).then(resolve).catch(reject);
  }
  readlink(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.readlink(filepath).then(resolve).catch(reject);
  }
  symlink(target, filepath, cb) {
    const [resolve, reject] = wrapCallback(cb);
    this.promises.symlink(target, filepath).then(resolve).catch(reject);
  }
  backFile(filepath, opts, cb) {
    const [resolve, reject] = wrapCallback(opts, cb);
    this.promises.backFile(filepath, opts).then(resolve).catch(reject);
  }
  du(filepath, cb) {
    const [resolve, reject] = wrapCallback(cb);
    this.promises.du(filepath).then(resolve).catch(reject);
  }
  flush(cb) {
    const [resolve, reject] = wrapCallback(cb);
    this.promises.flush().then(resolve).catch(reject);
  }
}
