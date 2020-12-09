import FS from "../index.js";

const fs = new FS();
const pfs = fs.promises;

// IDK it's broke. It's time to rewrite LightningFS basically.

xdescribe("hotswap backends", () => {

  it("graceful transition", async () => {
    const N = 1
    class MockBackend {
      constructor() {
        this.count = 0
        this.writeFile = this.writeFile.bind(this);
      }
      async writeFile () {
        await new Promise(r => setTimeout(r, 100 * Math.random()))
        this.count++
      }
      async readFile () {
        return 'foo'
      }
    }

    const b1 = new MockBackend();
    const b2 = new MockBackend();

    // write N files to mock backend 1
    await fs.init('testfs-custom-1', { backend: b1, defer: true });
    for (let i = 0; i < N; i++) {
      // we don't await
      pfs.writeFile('hello', 'foo');
    }

    // swap backends without waiting
    await fs.init('testfs-custom-2', { backend: b2, defer: true });
    expect(pfs._operations.size).toBe(N);

    // write N files to mock backend 2
    for (let i = 0; i < N; i++) {
      // we don't await
      pfs.writeFile('hello', 'foo');
    }

    // swap backend back without waiting
    fs.init('testfs-custom-1', { backend: b1, defer: true });
    expect(pfs._operations.size).toBe(N);

    // but now we have to wait. because we're dumb and the hotswapping isn't perfect
    await new Promise(r => setTimeout(r, 250));
    expect(pfs._operations.size).toBe(0);

    // everything should be synced now
    expect(b1.count).toBe(N)
    expect(b2.count).toBe(N)
  });

});
