module.exports = class HttpBackend {
  constructor(url) {
    this._url = url;
  }
  loadSuperblock() {
    return fetch(this._url + '/.superblock.txt').then(res => res.ok ? res.text() : null)
  }
  async readFile(filepath) {
    const res = await fetch(this._url + filepath)
    if (res.status === 200) {
      return res.arrayBuffer()
    } else {
      throw new Error('ENOENT')
    }
  }
  async sizeFile(filepath) {
    const res = await fetch(this._url + filepath, { method: 'HEAD' })
    if (res.status === 200) {
      return res.headers.get('content-length')
    } else {
      throw new Error('ENOENT')
    }
  }
}
