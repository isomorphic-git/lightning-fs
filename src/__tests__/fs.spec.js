import FS from "../index.js";

const fs = new FS("testfs", { wipe: true });

const HELLO = new Uint8Array([72, 69, 76, 76, 79]);

describe("fs module", () => {
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
    it("root directory already exists", done => {
      mkdir("/", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("EEXIST");
        done();
      });
    });
    it("create empty directory", done => {
      mkdir("/mkdir-test", err => {
        if (err) {
          expect(err.code).toEqual("EEXIST");
          done();
        } else {
          stat("/mkdir-test", (err, stat) => {
            expect(err).toEqual(null)
            done();
          });
        }
      });
    });
  });

  describe("writeFile", () => {
    it("create file", done => {
      mkdir("/writeFile", err => {
        writeFile("/writeFile/writeFile-uint8.txt", HELLO, err => {
          expect(err).toBe(null);
          stat("/writeFile/writeFile-uint8.txt", (err, stats) => {
            expect(err).toEqual(null)
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("create file (from string)", done => {
      mkdir("/writeFile", err => {
        writeFile("/writeFile/writeFile-string.txt", "HELLO", err => {
          expect(err).toBe(null);
          stat("/writeFile/writeFile-string.txt", (err, stats) => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("write file perserves old inode", done => {
      mkdir("/writeFile", err => {
        writeFile("/writeFile/writeFile-inode.txt", "HELLO", err => {
          expect(err).toBe(null);
          stat("/writeFile/writeFile-inode.txt", (err, stats) => {
            expect(err).toBe(null);
            let inode = stats.ino;
            writeFile("/writeFile/writeFile-inode.txt", "WORLD", err => {
              expect(err).toBe(null);
              stat("/writeFile/writeFile-inode.txt", (err, stats) => {
                expect(err).toBe(null);
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
      readFile("/readFile/non-existant.txt", (err, data) => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read file", done => {
      mkdir("/readFile", err => {
        writeFile("/readFile/readFile-uint8.txt", "HELLO", err => {
          expect(err).toBe(null);
          readFile("/readFile/readFile-uint8.txt", (err, data) => {
            expect(err).toBe(null);
            // instanceof comparisons on Uint8Array's retrieved from IDB are broken in Safari Mobile 11.x (source: https://github.com/dfahlander/Dexie.js/issues/656#issuecomment-391866600)
            expect([...data]).toEqual([...HELLO]);
            done();
          });
        });
      });
    });
    it("read file (encoding shorthand)", done => {
      mkdir("/readFile", err => {
        writeFile("/readFile/readFile-encoding-shorthand.txt", "HELLO", err => {
          expect(err).toBe(null);
          readFile("/readFile/readFile-encoding-shorthand.txt", "utf8", (err, data) => {
            expect(err).toBe(null);
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
    it("read file (encoding longhand)", done => {
      mkdir("/readFile", err => {
        writeFile("/readFile/readFile-encoding-longhand.txt", "HELLO", err => {
          expect(err).toBe(null);
          readFile("/readFile/readFile-encoding-longhand.txt", { encoding: "utf8" }, (err, data) => {
            expect(err).toBe(null);
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
  });

  describe("readdir", () => {
    it("read non-existant dir returns undefined", done => {
      readdir("/readdir/non-existant", (err, data) => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read root directory", done => {
      mkdir("/readdir", err => {
        readdir("/", (err, data) => {
          expect(err).toBe(null);
          expect(data.includes("readdir")).toBe(true);
          done();
        });
      });
    });
    it("read child directory", done => {
      mkdir("/readdir", () => {
        writeFile("/readdir/1.txt", "", () => {
          readdir("/readdir", (err, data) => {
            expect(err).toBe(null)
            expect(data).toEqual(["1.txt"])
            done();
          });
        });
      });
    });
  });

  describe("rmdir", () => {
    it("delete root directory fails", done => {
      rmdir("/", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOTEMPTY");
        done();
      });
    });
    it("delete non-existant directory fails", done => {
      rmdir("/rmdir/non-existant", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("delete non-empty directory fails", done => {
      mkdir("/rmdir", () => {
        mkdir("/rmdir/not-empty", () => {
          writeFile("/rmdir/not-empty/file.txt", "", () => {

            rmdir("/rmdir/not-empty", err => {
              expect(err).not.toBe(null);
              expect(err.code).toEqual("ENOTEMPTY");
              done();
            });
          })
        })
      })
    });
    it("delete empty directory", done => {
      mkdir("/rmdir", () => {
        mkdir("/rmdir/empty", () => {
          readdir("/rmdir", (err, data) => {
            expect(err).toBe(null);
            let originalSize = data.length;
            rmdir("/rmdir/empty", err => {
              expect(err).toBe(null);
              readdir("/rmdir", (err, data) => {
                expect(err).toBe(null);
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
      mkdir("/unlink", () => {
        writeFile("/unlink/file.txt", "", () => {
          readdir("/unlink", (err, data) => {
            let originalSize = data.length;
            unlink("/unlink/file.txt", (err) => {
              expect(err).toBe(null);
              readdir("/unlink", (err, data) => {
                expect(data.length).toBe(originalSize - 1)
                expect(data.includes("file.txt")).toBe(false);
                readFile("/unlink/file.txt", (err, data) => {
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
      mkdir("/rename", () => {
        writeFile("/rename/a.txt", "", () => {
          rename("/rename/a.txt", "/rename/b.txt", (err) => {
            expect(err).toBe(null);
            readdir("/rename", (err, data) => {
              expect(data.includes("a.txt")).toBe(false);
              expect(data.includes("b.txt")).toBe(true);
              readFile("/rename/a.txt", (err, data) => {
                expect(err).not.toBe(null)
                expect(err.code).toBe("ENOENT")
                readFile("/rename/b.txt", "utf8", (err, data) => {
                  expect(err).toBe(null)
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
      mkdir("/rename", () => {
        mkdir("/rename/a", () => {
          writeFile("/rename/a/file.txt", "", () => {
            rename("/rename/a", "/rename/b", (err) => {
              expect(err).toBe(null);
              readdir("/rename", (err, data) => {
                expect(data.includes("a")).toBe(false);
                expect(data.includes("b")).toBe(true);
                readFile("/rename/a/file.txt", (err, data) => {
                  expect(err).not.toBe(null)
                  expect(err.code).toBe("ENOENT")
                  readFile("/rename/b/file.txt", "utf8", (err, data) => {
                    expect(err).toBe(null)
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
