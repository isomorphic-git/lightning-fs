import CacheFS from "../CacheFS";

const treeText = require('./__fixtures__/tree.txt.js');

describe("CacheFS module", () => {
  it("print ∘ parse == id", () => {
    const fs = new CacheFS();
    let parsed = fs.parse(treeText)
    let text = fs.print(parsed)
    expect(text).toEqual(treeText)
  });
  it("size()", () => {
    const fs = new CacheFS();
    fs.activate()
    expect(fs.size()).toEqual(0)
    fs.activate(treeText)
    let inodeCount = treeText.trim().split('\n').length
    expect(fs.size()).toEqual(inodeCount)
  });
  it("autoinc()", () => {
    const fs = new CacheFS();
    fs.activate()
    expect(fs.autoinc()).toEqual(1)
    fs.writeStat('/foo', 3, {})
    expect(fs.autoinc()).toEqual(2)
    fs.mkdir('/bar', {})
    expect(fs.autoinc()).toEqual(3)
    fs.unlink('/foo')
    expect(fs.autoinc()).toEqual(3)
    fs.mkdir('/bar/baz', {})
    expect(fs.autoinc()).toEqual(4)
    fs.rmdir('/bar/baz')
    expect(fs.autoinc()).toEqual(3)
    fs.mkdir('/bar/bar', {})
    expect(fs.autoinc()).toEqual(4)
    fs.writeStat('/bar/bar/boo', 3, {})
    expect(fs.autoinc()).toEqual(5)
    fs.unlink('/bar/bar/boo')
    expect(fs.autoinc()).toEqual(4)
  });
  it("defaults uid/gid to 1 when not configured", () => {
    const fs = new CacheFS();
    fs.activate()
    fs.mkdir('/dir', {})
    fs.writeStat('/file', 3, {})
    expect(fs.stat('/dir').uid).toEqual(1)
    expect(fs.stat('/dir').gid).toEqual(1)
    expect(fs.stat('/file').uid).toEqual(1)
    expect(fs.stat('/file').gid).toEqual(1)
  });
  it("uses the configured default uid/gid for new files and directories", () => {
    const fs = new CacheFS('test', { uid: 42, gid: 43 });
    fs.activate()
    fs.mkdir('/dir', {})
    fs.writeStat('/file', 3, {})
    fs.symlink('/file', '/link')
    expect(fs.stat('/dir').uid).toEqual(42)
    expect(fs.stat('/dir').gid).toEqual(43)
    expect(fs.stat('/file').uid).toEqual(42)
    expect(fs.stat('/file').gid).toEqual(43)
    expect(fs.lstat('/link').uid).toEqual(42)
    expect(fs.lstat('/link').gid).toEqual(43)
  });
  it("mkdir/writeStat ignore uid/gid passed in opts (not settable except via chown)", () => {
    const fs = new CacheFS('test', { uid: 42, gid: 43 });
    fs.activate()
    fs.mkdir('/dir', { uid: 1, gid: 2 })
    fs.writeStat('/file', 3, { uid: 3, gid: 4 })
    expect(fs.stat('/dir').uid).toEqual(42)
    expect(fs.stat('/dir').gid).toEqual(43)
    expect(fs.stat('/file').uid).toEqual(42)
    expect(fs.stat('/file').gid).toEqual(43)
  });
  it("writeStat preserves a chown'd uid/gid when overwriting a file", () => {
    const fs = new CacheFS('test', { uid: 42, gid: 43 });
    fs.activate()
    fs.writeStat('/file', 3, {})
    fs.chown('/file', 7, 8)
    fs.writeStat('/file', 5, {})
    expect(fs.stat('/file').uid).toEqual(7)
    expect(fs.stat('/file').gid).toEqual(8)
  });
  it("chmod changes the mode of a file", () => {
    const fs = new CacheFS();
    fs.activate()
    fs.writeStat('/file', 3, { mode: 0o666 })
    fs.chmod('/file', 0o600)
    expect(fs.stat('/file').mode).toEqual(0o600)
  });
  it("chown changes the uid/gid of a file", () => {
    const fs = new CacheFS('test', { uid: 42, gid: 43 });
    fs.activate()
    fs.writeStat('/file', 3, {})
    fs.chown('/file', 7, 8)
    expect(fs.stat('/file').uid).toEqual(7)
    expect(fs.stat('/file').gid).toEqual(8)
  });
});
