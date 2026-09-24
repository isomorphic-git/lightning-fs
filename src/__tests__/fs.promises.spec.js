import FS from "../index.js";

const fs = new FS("testfs-promises", { wipe: true }).promises;
const fsOwner = new FS("testfs-promises-owner", { wipe: true, uid: 42, gid: 43 }).promises;

const HELLO = new Uint8Array([72, 69, 76, 76, 79]);

if (!Promise.prototype.finally) {
  Promise.prototype.finally = function (onFinally) {
    this.then(onFinally, onFinally);
  }
}

describe("fs.promises module", () => {
  describe("mkdir", () => {
    it("root directory already exists", (done) => {
      fs.mkdir("/").catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("EEXIST");
        done();
      });
    });
    it("create empty directory", done => {
      fs.mkdir("/mkdir-test")
      .then(() => {
        fs.stat("/mkdir-test").then(stat => {
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
      fs.mkdir("/writeFile").catch(err => {
        if (err.code !== "EEXIST") throw err;
      }).then(() => {
        fs.writeFile("/writeFile/writeFile-uint8.txt", HELLO).then(() => {
          fs.stat("/writeFile/writeFile-uint8.txt").then(stats => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("create file (from string)", done => {
      fs.mkdir("/writeFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/writeFile/writeFile-string.txt", "HELLO").then(() => {
          fs.stat("/writeFile/writeFile-string.txt").then(stats => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("write file perserves old inode", done => {
      fs.mkdir("/writeFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/writeFile/writeFile-inode.txt", "HELLO").then(() => {
          fs.stat("/writeFile/writeFile-inode.txt").then(stats => {
            let inode = stats.ino;
            fs.writeFile("/writeFile/writeFile-inode.txt", "WORLD").then(() => {
              fs.stat("/writeFile/writeFile-inode.txt").then(stats => {
                expect(stats.ino).toEqual(inode);
                done();
              });
            });
          });
        });
      });
    });
    it("write file perserves old mode", done => {
      fs.mkdir("/writeFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/writeFile/writeFile-mode.txt", "HELLO", { mode: 0o635 }).then(() => {
          fs.stat("/writeFile/writeFile-mode.txt").then(stats => {
            let mode = stats.mode;
            expect(mode).toEqual(0o635)
            fs.writeFile("/writeFile/writeFile-mode.txt", "WORLD").then(() => {
              fs.stat("/writeFile/writeFile-mode.txt").then(stats => {
                expect(stats.mode).toEqual(0o635);
                done();
              });
            });
          });
        });
      });
    });
    it("write file in place of an existing directory throws", done => {
      fs.mkdir("/writeFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/writeFile", "HELLO")
          .then(() => {
            fail();
            done();
          })
          .catch(err => {
            expect(err).not.toBe(null);
            done();
          });
      });
    });
  });

  describe("readFile", () => {
    it("read non-existant file throws", done => {
      fs.readFile("/readFile/non-existant.txt").catch(err => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read file", done => {
      fs.mkdir("/readFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readFile/readFile-uint8.txt", "HELLO").then(() => {
          fs.readFile("/readFile/readFile-uint8.txt").then(data => {
            // instanceof comparisons on Uint8Array's retrieved from IDB are broken in Safari Mobile 11.x (source: https://github.com/dfahlander/Dexie.js/issues/656#issuecomment-391866600)
            expect([...data]).toEqual([...HELLO]);
            done();
          });
        });
      });
    });
    it("read file (encoding shorthand)", done => {
      fs.mkdir("/readFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readFile/readFile-encoding-shorthand.txt", "HELLO").then(() => {
          fs.readFile("/readFile/readFile-encoding-shorthand.txt", "utf8").then(data => {
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
    it("read file (encoding longhand)", done => {
      fs.mkdir("/readFile").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readFile/readFile-encoding-longhand.txt", "HELLO").then(() => {
          fs.readFile("/readFile/readFile-encoding-longhand.txt", { encoding: "utf8" }).then(data => {
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
  });

  describe("readdir", () => {
    it("read non-existant dir returns undefined", done => {
      fs.readdir("/readdir/non-existant").catch(err => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read root directory", done => {
      fs.mkdir("/readdir").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.readdir("/").then(data => {
          expect(data.includes("readdir")).toBe(true);
          done();
        });
      });
    });
    it("read child directory", done => {
      fs.mkdir("/readdir").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readdir/1.txt", "").then(() => {
          fs.readdir("/readdir").then(data => {
            expect(data).toEqual(["1.txt"])
            done();
          });
        });
      });
    });
    it("read a file throws", done => {
      fs.mkdir("/readdir2").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readdir2/not-a-dir", "").then(() => {
          fs.readdir("/readdir2/not-a-dir").catch(err => {
            expect(err).not.toBe(null);
            expect(err.code).toBe('ENOTDIR');
            done();
          });
        })
      })
    });
  });

  describe("rmdir", () => {
    it("delete root directory fails", done => {
      fs.rmdir("/").catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOTEMPTY");
        done();
      });
    });
    it("delete non-existant directory fails", done => {
      fs.rmdir("/rmdir/non-existant").catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("delete non-empty directory fails", done => {
      fs.mkdir("/rmdir").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/rmdir/not-empty").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.writeFile("/rmdir/not-empty/file.txt", "").then(() => {

            fs.rmdir("/rmdir/not-empty").catch(err => {
              expect(err).not.toBe(null);
              expect(err.code).toEqual("ENOTEMPTY");
              done();
            });
          })
        })
      })
    });
    it("delete empty directory", done => {
      fs.mkdir("/rmdir").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/rmdir/empty").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.readdir("/rmdir").then(data => {
            let originalSize = data.length;
            fs.rmdir("/rmdir/empty").then(() => {
              fs.readdir("/rmdir").then(data => {
                expect(data.length === originalSize - 1);
                expect(data.includes("empty")).toBe(false);
                done();
              });
            });
          });
        });
      });
    });
    it("delete a file throws", done => {
      fs.mkdir("/rmdir").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/rmdir/not-a-dir", "").then(() => {
          fs.rmdir("/rmdir/not-a-dir").catch(err => {
            expect(err).not.toBe(null);
            expect(err.code).toBe('ENOTDIR');
            done();
          });
        });
      });
    });
  });

  describe("unlink", () => {
    it("create and delete file", done => {
      fs.mkdir("/unlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/unlink/file.txt", "").then(() => {
          fs.readdir("/unlink").then(data => {
            let originalSize = data.length;
            fs.unlink("/unlink/file.txt").then(() => {
              fs.readdir("/unlink").then(data => {
                expect(data.length).toBe(originalSize - 1)
                expect(data.includes("file.txt")).toBe(false);
                fs.readFile("/unlink/file.txt").catch(err => {
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
      fs.mkdir("/rename").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/rename/a.txt", "").then(() => {
          fs.rename("/rename/a.txt", "/rename/b.txt").then(() => {
            fs.readdir("/rename").then(data => {
              expect(data.includes("a.txt")).toBe(false);
              expect(data.includes("b.txt")).toBe(true);
              fs.readFile("/rename/a.txt").catch(err => {
                expect(err).not.toBe(null)
                expect(err.code).toBe("ENOENT")
                fs.readFile("/rename/b.txt", "utf8").then(data => {
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
      fs.mkdir("/rename").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/rename/a").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.writeFile("/rename/a/file.txt", "").then(() => {
            fs.rename("/rename/a", "/rename/b").then(() => {
              fs.readdir("/rename").then(data => {
                expect(data.includes("a")).toBe(false);
                expect(data.includes("b")).toBe(true);
                fs.readFile("/rename/a/file.txt").catch(err => {
                  expect(err).not.toBe(null)
                  expect(err.code).toBe("ENOENT")
                  fs.readFile("/rename/b/file.txt", "utf8").then(data => {
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

  describe("symlink", () => {
    it("symlink a file and read/write to it", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/symlink/a.txt", "hello").then(() => {
          fs.symlink("/symlink/a.txt", "/symlink/b.txt").then(() => {
            fs.readFile("/symlink/b.txt", "utf8").then(data => {
              expect(data).toBe("hello")
              fs.writeFile("/symlink/b.txt", "world").then(() => {
                fs.readFile("/symlink/a.txt", "utf8").then(data => {
                  expect(data).toBe("world");
                  done();
                })
              })
            });
          });
        });
      });
    });
    it("symlink a file and read/write to it (relative)", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/symlink/a.txt", "hello").then(() => {
          fs.symlink("a.txt", "/symlink/b.txt").then(() => {
            fs.readFile("/symlink/b.txt", "utf8").then(data => {
              expect(data).toBe("hello")
              fs.writeFile("/symlink/b.txt", "world").then(() => {
                fs.readFile("/symlink/a.txt", "utf8").then(data => {
                  expect(data).toBe("world");
                  done();
                })
              })
            });
          });
        });
      });
    });
    it("symlink a directory and read/write to it", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/symlink/a").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.writeFile("/symlink/a/file.txt", "data").then(() => {
            fs.symlink("/symlink/a", "/symlink/b").then(() => {
              fs.readdir("/symlink/b").then(data => {
                expect(data.includes("file.txt")).toBe(true);
                fs.readFile("/symlink/b/file.txt", "utf8").then(data => {
                  expect(data).toBe("data")
                  fs.writeFile("/symlink/b/file2.txt", "world").then(() => {
                    fs.readFile("/symlink/a/file2.txt", "utf8").then(data => {
                      expect(data).toBe("world");
                      done();
                    })
                  })
                });
              });
            });
          });
        });
      });
    });
    it("symlink a directory and read/write to it (relative)", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/symlink/a").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.mkdir("/symlink/b").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
            fs.writeFile("/symlink/a/file.txt", "data").then(() => {
              fs.symlink("../a", "/symlink/b/c").then(() => {
                fs.readdir("/symlink/b/c").then(data => {
                  expect(data.includes("file.txt")).toBe(true);
                  fs.readFile("/symlink/b/c/file.txt", "utf8").then(data => {
                    expect(data).toBe("data")
                    fs.writeFile("/symlink/b/c/file2.txt", "world").then(() => {
                      fs.readFile("/symlink/a/file2.txt", "utf8").then(data => {
                        expect(data).toBe("world");
                        done();
                      })
                    })
                  });
                });
              });
            });
          });
        });
      });
    });
    it("unlink doesn't follow symlinks", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/symlink/del").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.writeFile("/symlink/del/file.txt", "data").then(() => {
            fs.symlink("/symlink/del/file.txt", "/symlink/del/file2.txt").then(() => {
              fs.readdir("/symlink/del").then(data => {
                expect(data.includes("file.txt")).toBe(true)
                expect(data.includes("file2.txt")).toBe(true)
                fs.unlink("/symlink/del/file2.txt").then(data => {
                  fs.readdir("/symlink/del").then(data => {
                    expect(data.includes("file.txt")).toBe(true)
                    expect(data.includes("file2.txt")).toBe(false)
                    fs.readFile("/symlink/del/file.txt", "utf8").then(data => {
                      expect(data).toBe("data")
                      done();
                    })
                  });
                });
              });
            });
          });
        });
      });
    });
    it("lstat doesn't follow symlinks", done => {
      fs.mkdir("/symlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.mkdir("/symlink/lstat").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
          fs.writeFile("/symlink/lstat/file.txt", "data").then(() => {
            fs.symlink("/symlink/lstat/file.txt", "/symlink/lstat/file2.txt").then(() => {
              fs.stat("/symlink/lstat/file2.txt").then(stat => {
                expect(stat.isFile()).toBe(true)
                expect(stat.isSymbolicLink()).toBe(false)
                fs.lstat("/symlink/lstat/file2.txt").then(stat => {
                  expect(stat.isFile()).toBe(false)
                  expect(stat.isSymbolicLink()).toBe(true)
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  describe("readlink", () => {
    it("readlink returns the target path", done => {
      fs.mkdir("/readlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/readlink/a.txt", "hello").then(() => {
          fs.symlink("/readlink/a.txt", "/readlink/b.txt").then(() => {
            fs.readlink("/readlink/b.txt", "utf8").then(data => {
              expect(data).toBe("/readlink/a.txt")
              done();
            });
          });
        });
      });
    });
    it("readlink operates on paths with symlinks", done => {
      fs.mkdir("/readlink").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.symlink("/readlink", "/readlink/sub").then(() => {
          fs.writeFile("/readlink/c.txt", "hello").then(() => {
            fs.symlink("/readlink/c.txt", "/readlink/d.txt").then(() => {
              fs.readlink("/readlink/sub/d.txt").then(data => {
                expect(data).toBe("/readlink/c.txt")
                done();
              });
            });
          });
        });
      });
    });
  });

  describe("cp", () => {
    it("copies a file's contents to a new path", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/src.txt", "HELLO");
      await fs.cp("/cp/src.txt", "/cp/dest.txt");
      const data = await fs.readFile("/cp/dest.txt", "utf8");
      expect(data).toBe("HELLO");
    });
    it("copy is independent from the source afterwards", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/indep-src.txt", "HELLO");
      await fs.cp("/cp/indep-src.txt", "/cp/indep-dest.txt");
      await fs.writeFile("/cp/indep-dest.txt", "GOODBYE");
      const src = await fs.readFile("/cp/indep-src.txt", "utf8");
      expect(src).toBe("HELLO");
    });
    it("preserves the mode of the source file", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/mode-src.txt", "HELLO", { mode: 0o600 });
      await fs.cp("/cp/mode-src.txt", "/cp/mode-dest.txt");
      const stat = await fs.stat("/cp/mode-dest.txt");
      expect(stat.mode).toEqual(0o600);
    });
    it("throws EISDIR copying a directory without recursive", async () => {
      await fs.mkdir("/cp-dir-noopt").catch(() => {});
      await fs.writeFile("/cp-dir-noopt/a.txt", "HELLO");
      let err = null;
      try {
        await fs.cp("/cp-dir-noopt", "/cp-dir-noopt-dest");
      } catch (e) {
        err = e;
      }
      expect(err).not.toBe(null);
      expect(err.code).toEqual("EISDIR");
    });
    it("copies a directory tree recursively", async () => {
      await fs.mkdir("/cp-dir").catch(() => {});
      await fs.mkdir("/cp-dir/sub").catch(() => {});
      await fs.writeFile("/cp-dir/a.txt", "HELLO");
      await fs.writeFile("/cp-dir/sub/b.txt", "WORLD");
      await fs.cp("/cp-dir", "/cp-dir-dest", { recursive: true });
      const a = await fs.readFile("/cp-dir-dest/a.txt", "utf8");
      const b = await fs.readFile("/cp-dir-dest/sub/b.txt", "utf8");
      expect(a).toBe("HELLO");
      expect(b).toBe("WORLD");
    });
    it("throws EEXIST when force is false and errorOnExist is set and destination exists", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/exist-src.txt", "HELLO");
      await fs.writeFile("/cp/exist-dest.txt", "ALREADY THERE");
      let err = null;
      try {
        await fs.cp("/cp/exist-src.txt", "/cp/exist-dest.txt", { force: false, errorOnExist: true });
      } catch (e) {
        err = e;
      }
      expect(err).not.toBe(null);
      expect(err.code).toEqual("EEXIST");
      const dest = await fs.readFile("/cp/exist-dest.txt", "utf8");
      expect(dest).toBe("ALREADY THERE");
    });
    it("skips existing files when force is false", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/force-src.txt", "HELLO");
      await fs.writeFile("/cp/force-dest.txt", "ALREADY THERE");
      await fs.cp("/cp/force-src.txt", "/cp/force-dest.txt", { force: false });
      const dest = await fs.readFile("/cp/force-dest.txt", "utf8");
      expect(dest).toBe("ALREADY THERE");
    });
    it("overwrites the destination by default even when errorOnExist is set (force defaults to true)", async () => {
      await fs.mkdir("/cp").catch(() => {});
      await fs.writeFile("/cp/default-force-src.txt", "HELLO");
      await fs.writeFile("/cp/default-force-dest.txt", "ALREADY THERE");
      await fs.cp("/cp/default-force-src.txt", "/cp/default-force-dest.txt", { errorOnExist: true });
      const dest = await fs.readFile("/cp/default-force-dest.txt", "utf8");
      expect(dest).toBe("HELLO");
    });
    it("skips paths rejected by filter", async () => {
      await fs.mkdir("/cp-filter").catch(() => {});
      await fs.writeFile("/cp-filter/keep.txt", "KEEP");
      await fs.writeFile("/cp-filter/skip.txt", "SKIP");
      await fs.cp("/cp-filter", "/cp-filter-dest", {
        recursive: true,
        filter: (src) => !src.endsWith("skip.txt"),
      });
      const keep = await fs.readFile("/cp-filter-dest/keep.txt", "utf8");
      expect(keep).toBe("KEEP");
      let err = null;
      try {
        await fs.stat("/cp-filter-dest/skip.txt");
      } catch (e) {
        err = e;
      }
      expect(err).not.toBe(null);
      expect(err.code).toEqual("ENOENT");
    });
    it("throws when copying a directory into itself", async () => {
      await fs.mkdir("/cp-self").catch(() => {});
      let err = null;
      try {
        await fs.cp("/cp-self", "/cp-self/inner", { recursive: true });
      } catch (e) {
        err = e;
      }
      expect(err).not.toBe(null);
    });
    it("throws when copying the root directory anywhere", async () => {
      let err = null;
      try {
        await fs.cp("/", "/cp-root-dest", { recursive: true });
      } catch (e) {
        err = e;
      }
      expect(err).not.toBe(null);
    });
    it("creates missing destination parent directories during a recursive copy", async () => {
      await fs.mkdir("/cp-nested-src").catch(() => {});
      await fs.writeFile("/cp-nested-src/a.txt", "HELLO");
      await fs.cp("/cp-nested-src", "/cp-nested/does/not/exist/yet", { recursive: true });
      const data = await fs.readFile("/cp-nested/does/not/exist/yet/a.txt", "utf8");
      expect(data).toBe("HELLO");
    });
  });

  describe("du", () => {
    it("du returns the total file size of a path", done => {
      fs.mkdir("/du").catch(err => { if (err.code !== "EEXIST") throw err; }).then(() => {
        fs.writeFile("/du/a.txt", "hello").then(() => {
          fs.writeFile("/du/b.txt", "hello").then(() => {
            fs.mkdir("/du/sub").then(() => {
              fs.writeFile("/du/sub/a.txt", "hello").then(() => {
                fs.writeFile("/du/sub/b.txt", "hello").then(() => {
                  fs.du("/du/sub/a.txt").then(size => {
                    expect(size).toBe(5)
                    fs.du("/du/sub").then(size => {
                      expect(size).toBe(10)
                      fs.du("/du").then(size => {
                        expect(size).toBe(20)
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
  });

  describe("ownership", () => {
    it("stat defaults to uid/gid 1 when not configured", done => {
      fs.writeFile("/ownership-default.txt", "HELLO").then(() => {
        fs.stat("/ownership-default.txt").then(stats => {
          expect(stats.uid).toEqual(1);
          expect(stats.gid).toEqual(1);
          done();
        });
      });
    });
    it("new files use the uid/gid configured on the fs instance", done => {
      fsOwner.writeFile("/ownership-file.txt", "HELLO").then(() => {
        fsOwner.stat("/ownership-file.txt").then(stats => {
          expect(stats.uid).toEqual(42);
          expect(stats.gid).toEqual(43);
          done();
        });
      });
    });
    it("new directories use the uid/gid configured on the fs instance", done => {
      fsOwner.mkdir("/ownership-dir").then(() => {
        fsOwner.stat("/ownership-dir").then(stats => {
          expect(stats.uid).toEqual(42);
          expect(stats.gid).toEqual(43);
          done();
        });
      });
    });
    it("chmod changes the mode of a file", done => {
      fs.writeFile("/chmod.txt", "HELLO").then(() => {
        fs.chmod("/chmod.txt", 0o600).then(() => {
          fs.stat("/chmod.txt").then(stats => {
            expect(stats.mode).toEqual(0o600);
            done();
          });
        });
      });
    });
    it("chown changes the uid/gid of a file", done => {
      fs.writeFile("/chown.txt", "HELLO").then(() => {
        fs.chown("/chown.txt", 7, 8).then(() => {
          fs.stat("/chown.txt").then(stats => {
            expect(stats.uid).toEqual(7);
            expect(stats.gid).toEqual(8);
            done();
          });
        });
      });
    });
  });

  describe("utimes", () => {
    it("utimes sets mtime, readable back via stat", done => {
      fs.writeFile("/utimes.txt", "HELLO").then(() => {
        fs.utimes("/utimes.txt", 1000, 2000).then(() => {
          fs.stat("/utimes.txt").then(stats => {
            expect(stats.mtimeMs).toEqual(2000000);
            expect(stats.atimeMs).toEqual(1000000);
            done();
          });
        });
      });
    });
    it("a Date argument and a numeric-seconds argument produce the same stored value", done => {
      fs.writeFile("/utimes-date.txt", "HELLO").then(() => {
        const date = new Date(3000000);
        fs.utimes("/utimes-date.txt", date, date).then(() => {
          fs.stat("/utimes-date.txt").then(dateStats => {
            fs.utimes("/utimes-date.txt", 3000, 3000).then(() => {
              fs.stat("/utimes-date.txt").then(numStats => {
                expect(numStats.mtimeMs).toEqual(dateStats.mtimeMs);
                expect(numStats.atimeMs).toEqual(dateStats.atimeMs);
                expect(numStats.mtimeMs).toEqual(3000000);
                done();
              });
            });
          });
        });
      });
    });
    it("utimes follows a symlink (retimes the target, not the link)", done => {
      fs.mkdir("/utimes-symlink").finally(() => {
        fs.writeFile("/utimes-symlink/target.txt", "HELLO").then(() => {
          fs.symlink("/utimes-symlink/target.txt", "/utimes-symlink/link.txt").then(() => {
            fs.utimes("/utimes-symlink/link.txt", 5000, 6000).then(() => {
              fs.stat("/utimes-symlink/target.txt").then(targetStats => {
                expect(targetStats.mtimeMs).toEqual(6000000);
                fs.lstat("/utimes-symlink/link.txt").then(linkStats => {
                  expect(linkStats.mtimeMs).not.toEqual(6000000);
                  done();
                });
              });
            });
          });
        });
      });
    });
    it("lutimes does not follow a symlink (retimes the link, target untouched)", done => {
      fs.mkdir("/lutimes-symlink").finally(() => {
        fs.writeFile("/lutimes-symlink/target.txt", "HELLO").then(() => {
          fs.symlink("/lutimes-symlink/target.txt", "/lutimes-symlink/link.txt").then(() => {
            fs.stat("/lutimes-symlink/target.txt").then(originalTargetStats => {
              fs.lutimes("/lutimes-symlink/link.txt", 7000, 8000).then(() => {
                fs.lstat("/lutimes-symlink/link.txt").then(linkStats => {
                  expect(linkStats.mtimeMs).toEqual(8000000);
                  fs.stat("/lutimes-symlink/target.txt").then(targetStats => {
                    expect(targetStats.mtimeMs).toEqual(originalTargetStats.mtimeMs);
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
    it("throws ENOENT for a missing path", done => {
      fs.utimes("/utimes-missing.txt", 1, 1).catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("lutimes throws ENOENT for a missing path", done => {
      fs.lutimes("/lutimes-missing.txt", 1, 1).catch(err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("rejects a time that is not a number, numeric string or valid Date", done => {
      const invalid = [NaN, Infinity, "abc", null, undefined, true, {}, new Date("nope")];
      fs.writeFile("/utimes-invalid.txt", "HELLO").then(() => {
        Promise.all(
          invalid.map(time =>
            fs
              .utimes("/utimes-invalid.txt", time, time)
              .then(() => `accepted ${String(time)}`, () => null)
          )
        ).then(accepted => {
          expect(accepted.filter(Boolean)).toEqual([]);
          done();
        });
      });
    });
    it("stores a negative time rather than silently using the current time", done => {
      fs.writeFile("/utimes-negative.txt", "HELLO").then(() => {
        fs.utimes("/utimes-negative.txt", -1, -1).then(() => {
          fs.stat("/utimes-negative.txt").then(stats => {
            expect(stats.mtimeMs).toEqual(-1000);
            done();
          });
        });
      });
    });
  });

});
