import FS from "../index.js";

const fs = new FS();
const pfs = fs.promises;

describe("hotswap backends", () => {

  it("re-init with new backend", async () => {
    // write a file
    fs.init("testfs-1", { wipe: true })
    await pfs.writeFile('/a.txt', 'HELLO');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');

    // we swap backends. file is gone
    fs.init('testfs-2', { wipe: true })
    let err = null
    try {
      await pfs.readFile('/a.txt', 'utf8')
    } catch (e) {
      err = e
    }
    expect(err).not.toBeNull();
    expect(err.code).toBe('ENOENT');
  });

});
