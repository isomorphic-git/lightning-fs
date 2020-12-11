import FS from "../index.js";

const fs = new FS();
const pfs = fs.promises;

describe("hotswap backends", () => {

  it("swap back and forth between two backends", async () => {
    // write a file to backend A
    fs.init('testfs-A', { wipe: true });
    await pfs.writeFile('/a.txt', 'HELLO');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');

    // write a file to backend B
    fs.init('testfs-B', { wipe: true })
    await pfs.writeFile('/a.txt', 'WORLD');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('WORLD');

    // read a file from backend A
    fs.init('testfs-A');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');

    // read a file from backend B
    fs.init('testfs-B');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('WORLD');

    // read a file from backend A
    fs.init('testfs-A');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('HELLO');
  
    // read a file from backend B
    fs.init('testfs-B');
    expect(await pfs.readFile('/a.txt', 'utf8')).toBe('WORLD');
  });

});
