module.exports = class HttpBackend {
  constructor(url) {
    this._url = url;
  }
  loadSuperblock() {
    return fetch(this._url + '/.superblock.txt').then(res => res.text())
  }
  async readFile(filepath) {
    const res = await fetch(this._url + filepath)
    if (res.status === 200) {
      return res.arrayBuffer()
    } else {
      throw new Error('ENOENT')
    }
  }
}
