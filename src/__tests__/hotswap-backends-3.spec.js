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

  it("a backend without stat() does not trigger an unhandled rejection", async () => {
    spyOn(console, 'error');
    await pfs.init('testfs-no-stat', {
      backend: {
        init() {},
        readFile() { return 'dummy' },
      }
    });
    // let any fire-and-forget promises from init settle
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(console.error).not.toHaveBeenCalled();
  });

  it("surfaces a failing stat() during init instead of swallowing it", async () => {
    spyOn(console, 'error');
    const statError = new Error('boom');
    await pfs.init('testfs-stat-failure', {
      backend: {
        init() {},
        stat() { throw statError; },
        readFile() { return 'dummy' },
      }
    });
    // let the fire-and-forget stat('/') rejection reach the catch handler
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(console.error).toHaveBeenCalledWith(statError);
  });

});
