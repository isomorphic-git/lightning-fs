/**
 * MemoryBackend — a zero-dependency, in-memory storage backend for LightningFS.
 *
 * Works in **any** JavaScript environment that lacks IndexedDB:
 * Cloudflare Workers, Deno Deploy, Bun, Node.js, and browsers.
 *
 * Drop it in via the `db` option when constructing LightningFS:
 *
 * ```js
 * import LightningFS from '@isomorphic-git/lightning-fs'
 * import { MemoryBackend } from '@isomorphic-git/lightning-fs'
 *
 * const fs = new LightningFS('mem', { db: new MemoryBackend() })
 * ```
 *
 * ⚠️  **Persistence:** all data lives in JavaScript heap memory.
 *    It is lost when the runtime process / Worker isolate terminates.
 *    For persistence, implement the same five-method interface using
 *    your platform's durable storage (e.g. Cloudflare Durable Objects,
 *    Deno KV, Node.js SQLite, etc.).
 */

module.exports = class MemoryBackend {
  constructor() {
    /** @type {Map<string|number, any>} */
    this._map = new Map()
  }

  // -----------------------------------------------------------------------
  // The five methods LightningFS expects from every backend
  // -----------------------------------------------------------------------

  /**
   * Persist the serialised directory tree (superblock).
   * LightningFS calls this whenever the in-memory CacheFS is dirtied.
   * @param {any} superblock
   */
  saveSuperblock(superblock) {
    this._map.set('!root', superblock)
  }

  /**
   * Load the serialised directory tree on startup.
   * Return null if nothing has been saved yet (fresh filesystem).
   * @returns {any|null}
   */
  loadSuperblock() {
    return this._map.get('!root') || null
  }

  /**
   * Read raw file bytes by inode key.
   * @param {number} inode
   * @returns {any|null}
   */
  readFile(inode) {
    return this._map.get(inode) || null
  }

  /**
   * Write raw file bytes by inode key.
   * @param {number} inode
   * @param {any} data
   */
  writeFile(inode, data) {
    this._map.set(inode, data)
  }

  /**
   * Delete a file by inode key.
   * @param {number} inode
   */
  unlink(inode) {
    this._map.delete(inode)
  }

  // -----------------------------------------------------------------------
  // Optional helpers (same surface as IdbBackend)
  // -----------------------------------------------------------------------

  /**
   * Wipe all stored data.  Called when LightningFS is initialised with
   * `{ wipe: true }`.
   */
  async wipe() {
    this._map.clear()
  }

  /**
   * No-op: there is no connection to close for an in-memory store.
   * Provided for API parity with IdbBackend.
   */
  close() {}
}
