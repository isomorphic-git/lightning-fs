import FS from "../index.js";
const MemoryBackend = require("../MemoryBackend");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (data) => new TextDecoder().decode(data);
const quotaExceeded = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");

// Long enough for the debounced superblock save and the deactivation that follow the last operation (500 ms each).
const IDLE = 1200;

// Keeps everything in memory, and like IndexedDB stores and hands out copies of the superblock, and takes a while to
// store or delete a file's content. The specs choose which of those it refuses, as IndexedDB may when the storage is
// full, and when each one ends.
class RefusingDb extends MemoryBackend {
  constructor() {
    super();
    this.refuses = () => false;
    this.ends = () => sleep(1);
  }
  async writeFile(inode, data) {
    await this.ends("writeFile", inode, data);
    if (this.refuses("writeFile", inode, data)) throw quotaExceeded();
    return super.writeFile(inode, data);
  }
  async unlink(inode) {
    await this.ends("unlink", inode);
    if (this.refuses("unlink", inode)) throw quotaExceeded();
    return super.unlink(inode);
  }
  saveSuperblock(superblock) {
    return super.saveSuperblock(structuredClone(superblock));
  }
  loadSuperblock() {
    const superblock = super.loadSuperblock();
    return superblock && structuredClone(superblock);
  }
}

// Settles once p is refused by the storage, and fails the spec should p go through or fail otherwise
const refusal = (p) =>
  p.then(
    () => fail("expected the storage to refuse it"),
    (err) => expect(err.name).toBe("QuotaExceededError")
  );

// Settles once p fails with this code, and fails the spec should p go through
const failure = (p, code) =>
  p.then(
    () => fail(`expected ${code}`),
    (err) => expect(err.code).toBe(code)
  );

// A promise, and the function that resolves it
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

let count = 0;
// A file system of its own, on a RefusingDb
function setup() {
  const db = new RefusingDb();
  const name = `testfs-refused-content-${++count}`;
  return { db, name, fs: new FS(name, { db }).promises };
}

describe("refused content writes and deletions", () => {
  it("leave the tree as it was, also once it is saved", async () => {
    const { db, name, fs } = setup();
    await fs.writeFile("/kept.txt", "Kept");

    db.refuses = () => true;
    await refusal(fs.writeFile("/new.txt", "New"));
    await refusal(fs.writeFile("/kept.txt", "Changed"));
    await refusal(fs.unlink("/kept.txt"));
    db.refuses = () => false;

    expect(await fs.readdir("/")).toEqual(["kept.txt"]);
    expect((await fs.stat("/kept.txt")).size).toBe(4);
    expect(await fs.readFile("/kept.txt", "utf8")).toBe("Kept");

    await sleep(IDLE); // the tree is saved, and the file system deactivated
    const reloaded = new FS(name, { db }).promises;
    expect(await reloaded.readdir("/")).toEqual(["kept.txt"]);
    expect(await reloaded.readFile("/kept.txt", "utf8")).toBe("Kept");
  }, 10000);

  it("keep a write of the file that went through after one that was refused", async () => {
    const { db, fs } = setup();
    let writes = 0;
    db.refuses = (kind) => kind === "writeFile" && ++writes === 1;
    await Promise.all([refusal(fs.writeFile("/note.txt", "A")), fs.writeFile("/note.txt", "B")]);
    expect(await fs.readFile("/note.txt", "utf8")).toBe("B");
  });

  // What a refused write puts back is no longer what another refused write left
  it("leave no file after two refused writes of it", async () => {
    const { db, fs } = setup();
    db.refuses = () => true;
    await Promise.all([refusal(fs.writeFile("/new.txt", "A")), refusal(fs.writeFile("/new.txt", "BB"))]);
    expect(await fs.readdir("/")).toEqual([]);
  });

  // Without turns, the deletion takes the write's entry away, is refused after the write is, and puts the entry back
  it("leave no file after a refused write of it and a deletion", async () => {
    const { db, fs } = setup();
    const storing = deferred();
    db.refuses = () => true;
    db.ends = (kind) => {
      if (kind === "writeFile") storing.resolve();
      return sleep(kind === "writeFile" ? 10 : 20);
    };
    const written = refusal(fs.writeFile("/new.txt", "A"));
    await storing.promise; // the entry is in the tree, its content on its way
    await fs.unlink("/new.txt").catch(() => {});
    await written;
    expect(await fs.readdir("/")).toEqual([]);
  });

  // A file made after the kept one keeps the write from being given the kept file's inode, which on its own would
  // have the write's entry point at the kept file's content.
  it("keep a file whose deletion and the write after it were both refused", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/kept.txt", "Kept");
    await fs.writeFile("/later.txt", "Later");
    db.refuses = () => true;
    await Promise.all([refusal(fs.unlink("/kept.txt")), refusal(fs.writeFile("/kept.txt", "New"))]);
    expect((await fs.readdir("/")).sort()).toEqual(["kept.txt", "later.txt"]);
    expect((await fs.stat("/kept.txt")).size).toBe(4);
    expect(await fs.readFile("/kept.txt", "utf8")).toBe("Kept");
  });

  // Without turns, the first deletion is refused once the second has taken the file away, and puts back the file as it
  // was before the write; with turns, it is refused after 50 ms. A file made after the note keeps the write from being
  // given the note's inode, the highest one plus one.
  it("keep the write that went through between two refused deletions of the file", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/note.txt", "Old");
    await fs.writeFile("/later.txt", "Later");
    const ends = db.ends;
    const second = deferred();
    let first;
    let deletions = 0;
    db.refuses = (kind) => kind === "unlink";
    db.ends = async (kind) => {
      if (kind !== "unlink") return ends();
      if (++deletions === 1) {
        await Promise.race([second.promise, sleep(50)]);
      } else {
        second.resolve();
        await first.catch(() => {});
      }
    };
    first = fs.unlink("/note.txt");
    await Promise.all([refusal(first), fs.writeFile("/note.txt", "New"), refusal(fs.unlink("/note.txt"))]);
    expect(await fs.readFile("/note.txt", "utf8")).toBe("New");
  });

  it("leave no file after a refused write of it, renamed meanwhile", async () => {
    const { db, fs } = setup();
    const storing = deferred();
    db.refuses = () => true;
    db.ends = () => {
      storing.resolve();
      return sleep(10);
    };
    const written = refusal(fs.writeFile("/a.txt", "A"));
    await storing.promise; // the entry is in the tree, its content on its way
    await failure(fs.rename("/a.txt", "/b.txt"), "ENOENT");
    await written;
    expect(await fs.readdir("/")).toEqual([]);
  });

  // Calls on the folder do not wait for those on the files in it, but the file's entry is found in the renamed folder
  it("leave no file after a refused write of it in a folder renamed meanwhile", async () => {
    const { db, fs } = setup();
    await fs.mkdir("/old");
    const storing = deferred();
    db.refuses = () => true;
    db.ends = () => {
      storing.resolve();
      return sleep(10);
    };
    const written = refusal(fs.writeFile("/old/new.txt", "A"));
    await storing.promise; // the entry is in the folder, its content on its way
    await fs.rename("/old", "/moved");
    await written;
    expect(await fs.readdir("/")).toEqual(["moved"]);
    expect(await fs.readdir("/moved")).toEqual([]);
  });

  // Calls do not wait for those on another path that reaches the same file, through a symlink here
  it("keep a write that reached the file by another path while a refused one went on", async () => {
    const { db, fs } = setup();
    await fs.mkdir("/dir");
    await fs.symlink("/dir", "/link");
    const storing = deferred();
    db.refuses = (kind, inode, data) => text(data) === "A";
    db.ends = (kind, inode, data) => {
      storing.resolve();
      return sleep(text(data) === "A" ? 20 : 1);
    };
    const refused = refusal(fs.writeFile("/dir/f.txt", "A"));
    await storing.promise; // the entry is in the folder, its content on its way
    await fs.writeFile("/link/f.txt", "B");
    await refused;
    expect(await fs.readFile("/dir/f.txt", "utf8")).toBe("B");
  });

  it("keep a file made by another path while a refused deletion went on", async () => {
    const { db, fs } = setup();
    await fs.mkdir("/dir");
    await fs.symlink("/dir", "/link");
    await fs.writeFile("/dir/f.txt", "Old");
    const storing = deferred();
    db.refuses = (kind) => kind === "unlink";
    db.ends = (kind) => {
      storing.resolve();
      return sleep(kind === "unlink" ? 20 : 1);
    };
    const refused = refusal(fs.unlink("/dir/f.txt"));
    await storing.promise; // the file is out of the folder, its deletion on its way
    await fs.writeFile("/link/f.txt", "New");
    await refused;
    expect(await fs.readFile("/dir/f.txt", "utf8")).toBe("New");
  });

  // While the deletion goes on, the file is out of the tree. A new file would otherwise be given the highest inode
  // number in the tree plus one, the deleted file's own, and its content stored where the file put back points.
  it("keep a file whose deletion was refused from sharing its inode with a new file", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/x.txt", "X");
    const ends = db.ends;
    let written;
    db.refuses = (kind) => kind === "unlink";
    db.ends = (kind) => (kind === "unlink" ? written.catch(() => {}) : ends());
    const deleted = refusal(fs.unlink("/x.txt"));
    written = fs.writeFile("/y.txt", "Y");
    await Promise.all([deleted, written]);
    expect(await fs.readFile("/x.txt", "utf8")).toBe("X");
    expect(await fs.readFile("/y.txt", "utf8")).toBe("Y");
  });

  it("leave the destination of a refused copy as it was", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/src.txt", "Source");
    await fs.writeFile("/old.txt", "Old");
    db.refuses = () => true;
    await refusal(fs.cp("/src.txt", "/new.txt"));
    await refusal(fs.cp("/src.txt", "/old.txt"));
    db.refuses = () => false;
    expect(await fs.readdir("/")).toEqual(["src.txt", "old.txt"]);
    expect((await fs.stat("/old.txt")).size).toBe(3);
    expect(await fs.readFile("/old.txt", "utf8")).toBe("Old");
  });

  it("keep the files a recursive copy made before the one refused", async () => {
    const { db, fs } = setup();
    await fs.mkdir("/dir");
    await fs.writeFile("/dir/a.txt", "A");
    await fs.writeFile("/dir/b.txt", "B");
    await fs.writeFile("/dir/c.txt", "C");
    db.refuses = (kind, inode, data) => kind === "writeFile" && text(data) === "B";
    await refusal(fs.cp("/dir", "/copy", { recursive: true }));
    expect(await fs.readdir("/copy")).toEqual(["a.txt"]);
    expect(await fs.readFile("/copy/a.txt", "utf8")).toBe("A");
  });

  it("leave no file after a refused write of it and a refused copy to it", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/src.txt", "Source");
    db.refuses = () => true;
    await Promise.all([refusal(fs.writeFile("/dest.txt", "Written")), refusal(fs.cp("/src.txt", "/dest.txt"))]);
    expect(await fs.readdir("/")).toEqual(["src.txt"]);
  });

  it("copy a file while a refused deletion of it goes on", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/src.txt", "Source");
    const storing = deferred();
    db.refuses = (kind) => kind === "unlink";
    db.ends = () => {
      storing.resolve();
      return sleep(10);
    };
    const deleted = refusal(fs.unlink("/src.txt"));
    await storing.promise; // the file is out of the tree, its deletion on its way
    await fs.cp("/src.txt", "/dest.txt");
    await deleted;
    expect(await fs.readFile("/dest.txt", "utf8")).toBe("Source");
  });

  it("keep a mode change made while a refused write of the file went on", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/file.txt", "Old");
    const storing = deferred();
    db.refuses = () => true;
    db.ends = () => {
      storing.resolve();
      return sleep(10);
    };
    const written = refusal(fs.writeFile("/file.txt", "Newer"));
    await storing.promise; // the new entry is in the tree, its content on its way
    await fs.chmod("/file.txt", 0o600);
    await written;
    const stat = await fs.stat("/file.txt");
    expect(stat.mode).toBe(0o600);
    expect(stat.size).toBe(3);
    expect(await fs.readFile("/file.txt", "utf8")).toBe("Old");
  });

  it("make no folder in place of a file whose deletion was refused", async () => {
    const { db, fs } = setup();
    await fs.writeFile("/name", "File");
    const storing = deferred();
    db.refuses = () => true;
    db.ends = () => {
      storing.resolve();
      return sleep(10);
    };
    const deleted = refusal(fs.unlink("/name"));
    await storing.promise; // the file is out of the tree, its deletion on its way
    await failure(fs.mkdir("/name"), "EEXIST");
    await deleted;
    expect(await fs.readFile("/name", "utf8")).toBe("File");
  });
});

describe("without refusals", () => {
  it("give a deleted file's inode to a new file once the deletion has ended", async () => {
    const { fs } = setup();
    await fs.writeFile("/x.txt", "X");
    const { ino } = await fs.stat("/x.txt");
    await fs.unlink("/x.txt");
    await fs.writeFile("/y.txt", "Y");
    expect((await fs.stat("/y.txt")).ino).toBe(ino);
  });

  it("fail a write or a copy to the root with EISDIR", async () => {
    const { fs } = setup();
    await fs.writeFile("/src.txt", "Source");
    await failure(fs.writeFile("/", "A"), "EISDIR");
    await failure(fs.cp("/src.txt", "/"), "EISDIR");
  });

  it("fail a write in a folder that doesn't exist with ENOENT", async () => {
    const { fs } = setup();
    await failure(fs.writeFile("/missing/f.txt", "A"), "ENOENT");
  });
});
