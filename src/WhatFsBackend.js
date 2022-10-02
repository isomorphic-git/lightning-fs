const { split } = require("path")

class BadModeError extends Error {
  static assert(flags, mode) {
    if (mode === "r") {
      if (!flags.read) {
        throw new BadModeError(mode)
      }
      return
    }
    if (mode === "w") {
      if (!flags.write) {
        throw new BadModeError(mode)
      }
      return
    }
    if (mode === "a") {
      if (!(flags.write && flags.append)) {
        throw new BadModeError(mode)
      }
      return
    }
    throw new Error(`Asserting unknown mode '${mode}'`)
  }
}

class InvalidFlagsError extends Error {
  constructor(flags) {
    super('Invalid Flags')
    this.code = "ERR_INVALID_ARG_VALUE"
    this.received = flags
  }
}

class Flags {
  static fallback(o, fallback) {
    if (o) {
      return new Flags(o)
    } else {
      return fallback
    }
  }

  constructor(flags) {
    this.reset(flags)
  }

  reset(flags, fallback) {
    if (typeof(flags) === "string") {
      this.resetString(flags, fallback)
    } else {
      this.resetObj(flags, fallback)
    }
    return this
  }
  resetObj(obj, fallback) {
    if (obj?.read || obj?.write || obj?.append) {
      this.append = obj.append
      this.create = obj.create
      this.mustCreate = obj.mustCreate
      this.read = obj.read
      this.sync = obj.sync
      this.write = obj.write
    } else if (fallback) {
      this.reset(fallback)
    } else {
      throw new InvalidFlagsError(obj)
    }
    return this
  }
  resetString(str, fallback) {
    const tooLong = str?.length > 3
    if (!str?.length || tooLong) {
      if (fallback && !tooLong) {
        return this.reset(fallback)
      } else {
        throw new InvalidFlagsError(str)
      }
    }

    const mode = str[0]
    const append = mode === "a"
    const read = mode === "r"
    const write = mode === "w"

    if (!(append || read || write)) {
      throw new InvalidFlagsError(str)
    }

    let create = false
    let mustCreate = false
    let sync = false
    for (let i = 1; i < str.length; ++i) {
      const mod = str[i]
      if (mod === "x") {
        create = true
        mustCreate = true
      } else if (mod === "+") {
        read = true
        write = true
        create = true
      } else if (mod === "s") {
        sync = true
      } else {
        throw new InvalidFlagsError(str)
      }
    }

    this.append = append 
    this.create = create
    this.mustCreate = mustCreate
    this.read = read
    this.sync = sync
    this.write = write
    return this
  }

  toString() {
    const str = `${this.read ? 'r' : ''}${this.append ? 'a' : this.write ? 'w' : ''}${this.mustCreate ? `x` : ''}${this.sync ? 's' : ''}`
  }
}

class Noent extends Error {
  constructor(path) {
    super(`NOENT: no such file or directory, open '${path}'`)
    this.errno = -2
    this.code = "ENOENT"
    this.syscall = "open"
    this.path = path
  }
}

const ReadFlags = new Flags('r')
Object.freeze(ReadFlags)
const WriteFlags = new Flags('w')
Object.freeze(WriteFlags)

module.exports = class WhatFsBackend {
  static BadModeError = BadModeError
  static InvalidFlagsError = InvalidFlagsError
  static Flags = Flags

  async _resolveDir(paths) {
    let cursor = this._root
    for (const i = 1; i < paths.length - 1; ++i) {
      cursor = await cursor.getDirectoryHandle(paths[i])
    }
    return cursor
  }
  init() {
  }
  constructor(handle) {
    this._root = handle
  }
  activate() {
  }
  deactivate() {
  }
  saveSuperblock() {
  }
  loadSuperblock() {
  }
  async readFile(filepath, opts) {
    const flags = Flags.fallback(opts?.flags || ReadFlags)
    BadModeError.assert(flags, 'r')
    const { create } = flags
    const paths = split(filepath)
    const filename = paths[paths.length - 1]

    try {
      const dir = await this._resolveDir(paths)
      const handle = await dir.getFileHandle(filename, { create })

      // classic File API
      //const file = await handle.getFile()
      //return opts?.encoding === "utf8" ? file.text() : file.arrayBuffer()

      const access = handle.createSyncAccessHandle()
      const size = await handle.getSize()
      const buffer = new ArrayBuffer(size)
      access.read(buffer)
      access.close()
      
      if (opts?.encoding === "utf8") {
        const td = new TextDecoder()
        return td.decode(buffer)
      }
      return buffer
    } catch(e) {
      throw Noent(filepath)
    }
  }
  async writeFile(filepath, data, opts) {
    const flags = Flags.fallback(opts?.flags || WriteFlags)
    BadModeError.assert(flags, 'w')
    const { append, create, mustCreate } = flags
    const paths = split(filepath)

    let dir
    try {
      dir = await this._resolveDir(paths)
    } catch(err) {
      throw new Noent(filepath)
    }

    const filename = paths[paths.length - 1];
    flags?.mustCreate && await this._mustCreate(dir, filename);

    try {
      const handle = await dir.getFileHandle(filename, { create })
 
      // classic-ish FileSystemWritableFileStream
      //const position = append ? (await handle.getFile()).size : undefined
      //const writable = handle.createWritable({ keepExistingData: append })
      //await writable.write({ data, position: })
      //await writable.close()
      //return

      const access = handle.createSyncAccessHandle()
      const at = append ? await access.getSize() : undefined
      if (opts?.encoding === "utf8" || typeof(data) === "string") {
        const te = new TextEncoder()
        data = te.encode(data).buffer
      }

      await access.write(buffer, { at })
      await access.close()
    } catch(e) {
      throw Noent(filepath)
    }
  }
  async unlink(filepath) {
    const paths = split(filepath)
    const filename = paths[paths.length - 1]
    try {
      const dir = await this._resolveDir(paths)
      // classic File API only, WANTED: https://github.com/whatwg/fs/pull/9
      await dir.removeEntry(filename)
    } catch(e) {
      throw Noent(filepath)
    }
  }
  async readdir(filepath, opts) {
    const paths = split(filepath)
    const filename = paths[paths.length - 1]
    try {
      const dir = await this._resolveDir(paths)
      return dir.keys()
    } catch(e) {
      throw Noent(filepath)
    }
  }
  async mkdir(filepath, opts) {
    const paths = split(filepath)
    const last = paths.length - 1
    const dirname = paths[last]
    const recursive = opts?.recursive || false
    let firstCreated
    let cursor = this._root

    for (const i = 1; i <= last; ++i) {
      const path = paths[i]
      let existing
      try {
        existing = await cursor.getDirectoryHandle(path)
      } catch(err) {
      }

      if (existing) {
        if (i === last && !recursive) {
          throw new Error(`Directory '${filepath}' already existed`)
        }
        cursor = existing
      } else if (recursive) {
        if (!firstCreated) {
          firstCreated = paths.slice(0, i).join("/")
        }
        cursor = await cursor.getDirectoryHandle(path, { create: true })
      } else if (i === last) {
        cursor = await cursor.getDirectoryHandle(path, { create: true })
      } else {
        throw new Noent(filepath)
      }
    }
    return recursive ? firstCreated : undefined
  }
  async rmdir(filepath, opts) {
    if (opts?.recursive) {
      throw new Error("Deprecated 'recursive' rmdir not impmlemented")
    }
    return this.unlink(filepath)
  }
  async rename(oldFilepath, newFilepath) {
    // WANTED: https://github.com/whatwg/fs/pull/10
    const content = await this.readFile(oldFilepath)
    await this.writeFile(newFilePath, content)
    // for safety sake putting this last, at cost of extra disk usage
    await this.unlink(oldFilePath)
  }
  async stat(filepath, opts) {
    if (opts?.bigint) {
      throw new Error("Stat 'bigint' option not implemented")
    }
    const paths = split(filepath)
    const filename = paths[paths.length - 1]
    try {
      const dir = await this._resolveDir(paths)
      const handle = await dir.getFileHandle(filename)
      const file = await handle.getFile()
      const mtimeMs = file.lastModified
      // NEEDED: https://github.com/whatwg/fs/issues/12
      return {
        size: file.size,
        mtimeMs,
        mtime: new Date(mtimeMs)
      }
    } catch(err) {
      throw new Noent(filepath)
    }
  }
  async lstat(filepath, opts) {
    return this.stat(filepath)
  }
  async readlink(filepath, opts) {
    // NEEDED: https://github.com/whatwg/fs/issues/54
    throw new Error("Insufficient web standards for readlink");
  }
  async symlink(filepath, opts) {
    // NEEDED: https://github.com/whatwg/fs/issues/54
    throw new Error("Insufficient web standards for symlink");
  }
  async flush() {
    // flush and cache would make sense if we kept a filepath->handle cache,
    // which could definitely have other performance benefits
  }
  async close() {
    // see `flush()` for some possibilities
  }
  async wipe() {
    await this.rmdir("/", { recursive: true })
  }
  async watch() {
    // NEEDED: https://github.com/WICG/file-system-access/issues/72
    throw new Error("Insufficient web standards for watch")
  }
  async truncate(filepath, len = 0) {
    const paths = split(filepath)
    try {
      const dir = await this._resolveDir(paths)
      const handle = await dir.getFileHandle(paths[paths.length - 1])

      // classic
      //const writable = await handle.createWritable()
      //await writable.truncate(len)
      //await writable.close();

      const access = await handle.createSyncAccessHandle()
      await access.truncate(len)
      await access.close()
    } catch(err) {
      throw new Noent(filepath)
    }
  }
  async _mustCreate(dir, filename) {
    let resultNotFound = false
    try {
      await dir.getFileHandle(filename)
    } catch (err) {
      // TODO: maybe check this harder
      resultNotFound = true
    }
    if (!resultNotFound) {
       throw new Error("File '${filepath}' already existed")
    }
  }
}
