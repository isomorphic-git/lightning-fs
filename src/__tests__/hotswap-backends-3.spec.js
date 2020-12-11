import FS from "../index.js";

const fs = new FS();
const pfs = fs.promises;

describe("hotswap backends", () => {

  it("a custom backend", async () => {
    // we started with a default backend.
    fs.init('testfs-default', { wipe: true })
    await pfs.writeFile('/a.txt', 'HELLO');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');

    // we swap backends.
    let ranInit = false;
    let ranDestroy = false;
    fs.init('testfs-custom', {
      backend: {
        init() { ranInit = true },
        readFile() { return 'dummy' },
        destroy() { ranDestroy = true },
      }
    });
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('dummy');
    expect(ranInit).toBe(true);
    expect(ranDestroy).toBe(false);

    // we swap back
    fs.init('testfs-default');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');
    expect(ranDestroy).toBe(true);
  });

});
