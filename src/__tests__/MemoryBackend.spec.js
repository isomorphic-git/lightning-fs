const MemoryBackend = require("../MemoryBackend");

describe("MemoryBackend", function () {
  let backend;

  beforeEach(function () {
    backend = new MemoryBackend();
  });

  // -----------------------------------------------------------------------
  // loadSuperblock — fresh backend returns null
  // -----------------------------------------------------------------------

  it("loadSuperblock returns null on a fresh backend", function () {
    expect(backend.loadSuperblock()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // saveSuperblock / loadSuperblock round-trip
  // -----------------------------------------------------------------------

  it("saves and loads a superblock string", function () {
    const sb = "fake-superblock-data";
    backend.saveSuperblock(sb);
    expect(backend.loadSuperblock()).toBe(sb);
  });

  it("saves and loads a superblock object", function () {
    const sb = { root: { type: "dir" } };
    backend.saveSuperblock(sb);
    expect(backend.loadSuperblock()).toBe(sb);
  });

  it("overwrites the previous superblock", function () {
    backend.saveSuperblock("first");
    backend.saveSuperblock("second");
    expect(backend.loadSuperblock()).toBe("second");
  });

  // -----------------------------------------------------------------------
  // readFile — unknown inode
  // -----------------------------------------------------------------------

  it("readFile returns null for an unknown inode", function () {
    expect(backend.readFile(42)).toBeNull();
  });

  // -----------------------------------------------------------------------
  // writeFile / readFile round-trip
  // -----------------------------------------------------------------------

  it("writes and reads file data by inode", function () {
    const data = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    backend.writeFile(1, data);
    expect(backend.readFile(1)).toBe(data);
  });

  it("overwrites file data for the same inode", function () {
    backend.writeFile(1, new Uint8Array([1]));
    const newData = new Uint8Array([2]);
    backend.writeFile(1, newData);
    expect(backend.readFile(1)).toBe(newData);
  });

  it("stores multiple inodes independently", function () {
    const a = new Uint8Array([0x41]);
    const b = new Uint8Array([0x42]);
    backend.writeFile(1, a);
    backend.writeFile(2, b);
    expect(backend.readFile(1)).toBe(a);
    expect(backend.readFile(2)).toBe(b);
  });

  // -----------------------------------------------------------------------
  // unlink
  // -----------------------------------------------------------------------

  it("unlink removes a file so readFile returns null", function () {
    backend.writeFile(1, new Uint8Array([0x41]));
    backend.unlink(1);
    expect(backend.readFile(1)).toBeNull();
  });

  it("unlink is a no-op for a non-existent inode", function () {
    expect(function () { backend.unlink(999); }).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // wipe
  // -----------------------------------------------------------------------

  it("wipe clears all files and the superblock", function (done) {
    backend.saveSuperblock("sb");
    backend.writeFile(1, new Uint8Array([0x41]));
    backend.writeFile(2, new Uint8Array([0x42]));

    backend.wipe().then(function () {
      expect(backend.loadSuperblock()).toBeNull();
      expect(backend.readFile(1)).toBeNull();
      expect(backend.readFile(2)).toBeNull();
      done();
    });
  });

  // -----------------------------------------------------------------------
  // close — no-op, must not throw
  // -----------------------------------------------------------------------

  it("close does not throw", function () {
    expect(function () { backend.close(); }).not.toThrow();
  });
});
