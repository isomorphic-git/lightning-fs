import FS from "../index.js";
const MemoryBackend = require("../MemoryBackend");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Long enough for the debounced superblock save and the deactivation that follow the last operation (500 ms each).
const IDLE = 1200;

// Keeps everything in memory, but refuses to save the superblock while `refusing` is set, as IndexedDB does when the
// storage is full. Like IndexedDB, it stores and hands out copies, so a change to the tree only reaches it by a save.
class RefusingDb extends MemoryBackend {
  constructor() {
    super();
    this.refusing = false;
    this.refusal = new DOMException("The quota has been exceeded.", "QuotaExceededError");
  }
  saveSuperblock(superblock) {
    if (this.refusing) return Promise.reject(this.refusal);
    return super.saveSuperblock(structuredClone(superblock));
  }
  loadSuperblock() {
    const superblock = super.loadSuperblock();
    return superblock && structuredClone(superblock);
  }
}

describe("refused superblock writes", () => {
  it("do not fail later operations, and the tree is saved once the storage takes writes again", async () => {
    spyOn(console, "error");
    const db = new RefusingDb();
    const fs = new FS("testfs-refused-superblock", { db }).promises;
    await fs.writeFile("/a.txt", "A");

    db.refusing = true;
    await fs.writeFile("/b.txt", "B");
    await sleep(IDLE); // the debounced save and the deactivation are both refused

    expect(await fs.readFile("/a.txt", "utf8")).toBe("A");
    await fs.writeFile("/c.txt", "C");

    db.refusing = false;
    await sleep(IDLE); // the next save goes through

    const reloaded = new FS("testfs-refused-superblock", { db }).promises;
    expect(await reloaded.readdir("/")).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(await reloaded.readFile("/b.txt", "utf8")).toBe("B");
    expect(await reloaded.readFile("/c.txt", "utf8")).toBe("C");
    // Both refusals were reported: the debounced save's and the deactivation's
    expect(console.error.calls.allArgs().filter(([err]) => err === db.refusal).length).toBe(2);
  }, 10000);
});
