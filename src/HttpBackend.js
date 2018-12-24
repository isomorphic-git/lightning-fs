module.exports = class IdbBackend {
  constructor(url) {
    this._url = url;
  }
  loadSuperblock() {
    return fetch(this._url + '/.superblock.txt').then(res => res.text())
  }
  readFile(filepath) {
    return fetch(this._url + filepath).then(res => res.arrayBuffer())
  }
}
