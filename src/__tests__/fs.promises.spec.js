import FS from "../index.js";

const fs = new FS("testfs", { wipe: true }).promises;

const HELLO = new Uint8Array([72, 69, 76, 76, 79]);

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe("promises module", () => {
  const {
    mkdir,
    readdir,
    rmdir,
    writeFile,
    readFile,
    unlink,
    stat,
    rename,
    lstat,
    symlink,
    readlink
  } = fs;

  describe("mkdir", () => {
    it("root directory already exists", (done) => {
      mkdir("/").catch(err => {
        expect(err).not.toBe(null);
        console.log(err)
        expect(err.code).toEqual("EEXIST");
        done();
      });
    });
    it("create empty directory", done => {
      mkdir("/mkdir-test")
      .then(() => {
        stat("/mkdir-test").then(stat => {
          done();
        });
      })
      .catch(err => {
        expect(err.code).toEqual("EEXIST");
        done();
      });
    });
  });

  describe("writeFile", () => {
    it("create file", done => {
      mkdir("/writeFile").finally(() => {
        writeFile("/writeFile/writeFile-uint8.txt", HELLO).then(() => {
          stat("/writeFile/writeFile-uint8.txt").then(stats => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("create file (from string)", done => {
      mkdir("/writeFile").finally(() => {
        writeFile("/writeFile/writeFile-string.txt", "HELLO").then(() => {
          stat("/writeFile/writeFile-string.txt").then(stats => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("write file perserves old inode", done => {
      mkdir("/writeFile").finally(() => {
        writeFile("/writeFile/writeFile-inode.txt", "HELLO").then(() => {
          stat("/writeFile/writeFile-inode.txt").then(stats => {
            let inode = stats.ino;
            writeFile("/writeFile/writeFile-inode.txt", "WORLD").then(() => {
              stat("/writeFile/writeFile-inode.txt").then(stats => {
                expect(stats.ino).toEqual(inode);
                done();
              });
            });
          });
        });
      });
    });
  });

  describe("readFile", () => {
    it("read non-existant file throws", done => {
      readFile("/readFile/non-existant.txt").catch(err => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read file", done => {
      mkdir("/readFile").finally(() => {
        writeFile("/readFile/readFile-uint8.txt", "HELLO").then(() => {
          readFile("/readFile/readFile-uint8.txt").then(data => {
            // instanceof comparisons on Uint8Array's retrieved from IDB are broken in Safari Mobile 11.x (source: https://github.com/dfahlander/Dexie.js/issues/656#issuecomment-391866600)
            expect([...data]).toEqual([...HELLO]);
            done();
          });
        });
      });
    });
    it("read file (encoding shorthand)", done => {
      mkdir("/readFile").finally(() => {
        writeFile("/readFile/readFile-encoding-shorthand.txt", "HELLO").then(() => {
          readFile("/readFile/readFile-encoding-shorthand.txt", "utf8").then(data => {
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
    it("read file (encoding longhand)", done => {
      mkdir("/readFile").finally(() => {
        writeFile("/readFile/readFile-encoding-longhand.txt", "HELLO").then(() => {
          readFile("/readFile/readFile-encoding-longhand.txt", { encoding: "utf8" }).then(data => {
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
  });

  describe("readdir", () => {
    it("read non-existant dir returns undefined", done => {
      readdir("/readdir/non-existant").catch(err => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read root directory", done => {
      mkdir("/readdir").finally(() => {
        readdir("/").then(data => {
          expect(data.includes("readdir")).toBe(true);
          done();
        });
      });
    });
    it("read child directory", done => {
      mkdir("/readdir").finally(() => {
        writeFile("/readdir/1.txt", "").then(() => {
          readdir("/readdir").then(data => {
            expect(data).toEqual(["1.txt"])
            done();
          });
        });
      });
    });
  });

  describe("rmdir", () => {
    it("delete root directory fails", done => {
      rmdir("/").catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOTEMPTY");
        done();
      });
    });
    it("delete non-existant directory fails", done => {
      rmdir("/rmdir/non-existant").catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("delete non-empty directory fails", done => {
      mkdir("/rmdir").finally(() => {
        mkdir("/rmdir/not-empty").finally(() => {
          writeFile("/rmdir/not-empty/file.txt", "").then(() => {

            rmdir("/rmdir/not-empty").catch(err => {
              expect(err).not.toBe(null);
              expect(err.code).toEqual("ENOTEMPTY");
              done();
            });
          })
        })
      })
    });
    it("delete empty directory", done => {
      mkdir("/rmdir").finally(() => {
        mkdir("/rmdir/empty").finally(() => {
          readdir("/rmdir").then(data => {
            let originalSize = data.length;
            rmdir("/rmdir/empty").then(() => {
              readdir("/rmdir").then(data => {
                expect(data.length === originalSize - 1);
                expect(data.includes("empty")).toBe(false);
                done();
              });
            });
          });
        });
      });
    });
  });

  describe("unlink", () => {
    it("create and delete file", done => {
      mkdir("/unlink").finally(() => {
        writeFile("/unlink/file.txt", "").then(() => {
          readdir("/unlink").then(data => {
            let originalSize = data.length;
            unlink("/unlink/file.txt").then(() => {
              readdir("/unlink").then(data => {
                expect(data.length).toBe(originalSize - 1)
                expect(data.includes("file.txt")).toBe(false);
                readFile("/unlink/file.txt").catch(err => {
                  expect(err).not.toBe(null)
                  expect(err.code).toBe("ENOENT")
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  describe("rename", () => {
    it("create and rename file", done => {
      mkdir("/rename").finally(() => {
        writeFile("/rename/a.txt", "").then(() => {
          rename("/rename/a.txt", "/rename/b.txt").then(() => {
            readdir("/rename").then(data => {
              expect(data.includes("a.txt")).toBe(false);
              expect(data.includes("b.txt")).toBe(true);
              readFile("/rename/a.txt").catch(err => {
                expect(err).not.toBe(null)
                expect(err.code).toBe("ENOENT")
                readFile("/rename/b.txt", "utf8").then(data => {
                  expect(data).toBe("")
                  done();
                });
              });
            });
          });
        });
      });
    });
    it("create and rename directory", done => {
      mkdir("/rename").finally(() => {
        mkdir("/rename/a").finally(() => {
          writeFile("/rename/a/file.txt", "").then(() => {
            rename("/rename/a", "/rename/b").then(() => {
              readdir("/rename").then(data => {
                expect(data.includes("a")).toBe(false);
                expect(data.includes("b")).toBe(true);
                readFile("/rename/a/file.txt").catch(err => {
                  expect(err).not.toBe(null)
                  expect(err.code).toBe("ENOENT")
                  readFile("/rename/b/file.txt", "utf8").then(data => {
                    expect(data).toBe("")
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
