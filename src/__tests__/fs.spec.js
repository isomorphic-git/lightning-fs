import FS from "../index.js";

const fs = new FS("testfs", { wipe: true });

const HELLO = new Uint8Array([72, 69, 76, 76, 79]);

describe("fs module", () => {
  describe("mkdir", () => {
    it("root directory already exists", done => {
      fs.mkdir("/", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("EEXIST");
        done();
      });
    });
    it("create empty directory", done => {
      fs.mkdir("/mkdir-test", err => {
        if (err) {
          expect(err.code).toEqual("EEXIST");
          done();
        } else {
          fs.stat("/mkdir-test", (err, stat) => {
            expect(err).toEqual(null)
            done();
          });
        }
      });
    });
  });

  describe("writeFile", () => {
    it("create file", done => {
      fs.mkdir("/writeFile", err => {
        fs.writeFile("/writeFile/writeFile-uint8.txt", HELLO, err => {
          expect(err).toBe(null);
          fs.stat("/writeFile/writeFile-uint8.txt", (err, stats) => {
            expect(err).toEqual(null)
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("create file (from string)", done => {
      fs.mkdir("/writeFile", err => {
        fs.writeFile("/writeFile/writeFile-string.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.stat("/writeFile/writeFile-string.txt", (err, stats) => {
            expect(stats.size).toEqual(5);
            done();
          });
        });
      });
    });
    it("write file perserves old inode", done => {
      fs.mkdir("/writeFile", err => {
        fs.writeFile("/writeFile/writeFile-inode.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.stat("/writeFile/writeFile-inode.txt", (err, stats) => {
            expect(err).toBe(null);
            let inode = stats.ino;
            fs.writeFile("/writeFile/writeFile-inode.txt", "WORLD", err => {
              expect(err).toBe(null);
              fs.stat("/writeFile/writeFile-inode.txt", (err, stats) => {
                expect(err).toBe(null);
                expect(stats.ino).toEqual(inode);
                done();
              });
            });
          });
        });
      });
    });
    it("write file in place of an existing directory throws", done => {
      fs.mkdir("/writeFile", err => {
        fs.writeFile("/writeFile", "HELLO", err => {
          expect(err).not.toBe(null);
          done();
        });
      });
    });
  });

  describe("readFile", () => {
    it("read non-existant file throws", done => {
      fs.readFile("/readFile/non-existant.txt", (err, data) => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read file", done => {
      fs.mkdir("/readFile", err => {
        fs.writeFile("/readFile/readFile-uint8.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.readFile("/readFile/readFile-uint8.txt", (err, data) => {
            expect(err).toBe(null);
            // instanceof comparisons on Uint8Array's retrieved from IDB are broken in Safari Mobile 11.x (source: https://github.com/dfahlander/Dexie.js/issues/656#issuecomment-391866600)
            expect([...data]).toEqual([...HELLO]);
            done();
          });
        });
      });
    });
    it("read file (encoding shorthand)", done => {
      fs.mkdir("/readFile", err => {
        fs.writeFile("/readFile/readFile-encoding-shorthand.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.readFile("/readFile/readFile-encoding-shorthand.txt", "utf8", (err, data) => {
            expect(err).toBe(null);
            expect(data).toEqual("HELLO");
            done();
          });
        });
      });
    });
    it("read file (encoding longhand)", done => {
      fs.mkdir("/readFile", err => {
        fs.writeFile("/readFile/readFile-encoding-longhand.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.readFile("/readFile/readFile-encoding-longhand.txt", { encoding: "utf8" }, (err, data) => {
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
      fs.readdir("/readdir/non-existant", (err, data) => {
        expect(err).not.toBe(null);
        done();
      });
    });
    it("read root directory", done => {
      fs.mkdir("/readdir", err => {
        fs.readdir("/", (err, data) => {
          expect(err).toBe(null);
          expect(data.includes("readdir")).toBe(true);
          done();
        });
      });
    });
    it("read child directory", done => {
      fs.mkdir("/readdir", () => {
        fs.writeFile("/readdir/1.txt", "", () => {
          fs.readdir("/readdir", (err, data) => {
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
      fs.rmdir("/", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOTEMPTY");
        done();
      });
    });
    it("delete non-existant directory fails", done => {
      fs.rmdir("/rmdir/non-existant", err => {
        expect(err).not.toBe(null);
        expect(err.code).toEqual("ENOENT");
        done();
      });
    });
    it("delete non-empty directory fails", done => {
      fs.mkdir("/rmdir", () => {
        fs.mkdir("/rmdir/not-empty", () => {
          fs.writeFile("/rmdir/not-empty/file.txt", "", () => {

            fs.rmdir("/rmdir/not-empty", err => {
              expect(err).not.toBe(null);
              expect(err.code).toEqual("ENOTEMPTY");
              done();
            });
          })
        })
      })
    });
    it("delete empty directory", done => {
      fs.mkdir("/rmdir", () => {
        fs.mkdir("/rmdir/empty", () => {
          fs.readdir("/rmdir", (err, data) => {
            expect(err).toBe(null);
            let originalSize = data.length;
            fs.rmdir("/rmdir/empty", err => {
              expect(err).toBe(null);
              fs.readdir("/rmdir", (err, data) => {
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
      fs.mkdir("/unlink", () => {
        fs.writeFile("/unlink/file.txt", "", () => {
          fs.readdir("/unlink", (err, data) => {
            let originalSize = data.length;
            fs.unlink("/unlink/file.txt", (err) => {
              expect(err).toBe(null);
              fs.readdir("/unlink", (err, data) => {
                expect(data.length).toBe(originalSize - 1)
                expect(data.includes("file.txt")).toBe(false);
                fs.readFile("/unlink/file.txt", (err, data) => {
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
      fs.mkdir("/rename", () => {
        fs.writeFile("/rename/a.txt", "", () => {
          fs.rename("/rename/a.txt", "/rename/b.txt", (err) => {
            expect(err).toBe(null);
            fs.readdir("/rename", (err, data) => {
              expect(data.includes("a.txt")).toBe(false);
              expect(data.includes("b.txt")).toBe(true);
              fs.readFile("/rename/a.txt", (err, data) => {
                expect(err).not.toBe(null)
                expect(err.code).toBe("ENOENT")
                fs.readFile("/rename/b.txt", "utf8", (err, data) => {
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
      fs.mkdir("/rename", () => {
        fs.mkdir("/rename/a", () => {
          fs.writeFile("/rename/a/file.txt", "", () => {
            fs.rename("/rename/a", "/rename/b", (err) => {
              expect(err).toBe(null);
              fs.readdir("/rename", (err, data) => {
                expect(data.includes("a")).toBe(false);
                expect(data.includes("b")).toBe(true);
                fs.readFile("/rename/a/file.txt", (err, data) => {
                  expect(err).not.toBe(null)
                  expect(err.code).toBe("ENOENT")
                  fs.readFile("/rename/b/file.txt", "utf8", (err, data) => {
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

  describe("symlink", () => {
    it("symlink a file and read/write to it", done => {
      fs.mkdir("/symlink", () => {
        fs.writeFile("/symlink/a.txt", "hello", () => {
          fs.symlink("/symlink/a.txt", "/symlink/b.txt", () => {
            fs.readFile("/symlink/b.txt", "utf8", (err, data) => {
              expect(err).toBe(null)
              expect(data).toBe("hello")
              fs.writeFile("/symlink/b.txt", "world", () => {
                fs.readFile("/symlink/a.txt", "utf8", (err, data) => {
                  expect(err).toBe(null)
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
      fs.mkdir("/symlink", () => {
        fs.writeFile("/symlink/a.txt", "hello", () => {
          fs.symlink("a.txt", "/symlink/b.txt", () => {
            fs.readFile("/symlink/b.txt", "utf8", (err, data) => {
              expect(err).toBe(null)
              expect(data).toBe("hello")
              fs.writeFile("/symlink/b.txt", "world", () => {
                fs.readFile("/symlink/a.txt", "utf8", (err, data) => {
                  expect(err).toBe(null)
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
      fs.mkdir("/symlink", () => {
        fs.mkdir("/symlink/a", () => {
          fs.writeFile("/symlink/a/file.txt", "data", () => {
            fs.symlink("/symlink/a", "/symlink/b", () => {
              fs.readdir("/symlink/b", (err, data) => {
                expect(err).toBe(null)
                expect(data.includes("file.txt")).toBe(true);
                fs.readFile("/symlink/b/file.txt", "utf8", (err, data) => {
                  expect(err).toBe(null)
                  expect(data).toBe("data")
                  fs.writeFile("/symlink/b/file2.txt", "world", () => {
                    fs.readFile("/symlink/a/file2.txt", "utf8", (err, data) => {
                      expect(err).toBe(null);
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
      fs.mkdir("/symlink", () => {
        fs.mkdir("/symlink/a", () => {
          fs.mkdir("/symlink/b", () => {
            fs.writeFile("/symlink/a/file.txt", "data", () => {
              fs.symlink("../a", "/symlink/b/c", () => {
                fs.readdir("/symlink/b/c", (err, data) => {
                  expect(err).toBe(null)
                  expect(data.includes("file.txt")).toBe(true);
                  fs.readFile("/symlink/b/c/file.txt", "utf8", (err, data) => {
                    expect(err).toBe(null)
                    expect(data).toBe("data")
                    fs.writeFile("/symlink/b/c/file2.txt", "world", () => {
                      fs.readFile("/symlink/a/file2.txt", "utf8", (err, data) => {
                        expect(err).toBe(null);
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
      fs.mkdir("/symlink", () => {
        fs.mkdir("/symlink/del", () => {
          fs.writeFile("/symlink/del/file.txt", "data", () => {
            fs.symlink("/symlink/del/file.txt", "/symlink/del/file2.txt", () => {
              fs.readdir("/symlink/del", (err, data) => {
                expect(err).toBe(null)
                expect(data.includes("file.txt")).toBe(true)
                expect(data.includes("file2.txt")).toBe(true)
                fs.unlink("/symlink/del/file2.txt", (err, data) => {
                  expect(err).toBe(null)
                  fs.readdir("/symlink/del", (err, data) => {
                    expect(err).toBe(null)
                    expect(data.includes("file.txt")).toBe(true)
                    expect(data.includes("file2.txt")).toBe(false)
                    fs.readFile("/symlink/del/file.txt", "utf8", (err, data) => {
                      expect(err).toBe(null)
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
    it("lstat for symlink creates correct mode", done => {
      fs.mkdir("/symlink", () => {
        fs.writeFile("/symlink/a.txt", "hello", () => {
          fs.symlink("/symlink/a.txt", "/symlink/b.txt", () => {
            fs.lstat("/symlink/b.txt", (err, stat) => {
              expect(err).toBe(null)
              expect(stat.mode).toBe(0o120000)
							done();
            });
          });
        });
      });
    });
    it("lstat doesn't follow symlinks", done => {
      fs.mkdir("/symlink", () => {
        fs.mkdir("/symlink/lstat", () => {
          fs.writeFile("/symlink/lstat/file.txt", "data", () => {
            fs.symlink("/symlink/lstat/file.txt", "/symlink/lstat/file2.txt", () => {
              fs.stat("/symlink/lstat/file2.txt", (err, stat) => {
                expect(err).toBe(null)
                expect(stat.isFile()).toBe(true)
                expect(stat.isSymbolicLink()).toBe(false)
                fs.lstat("/symlink/lstat/file2.txt", (err, stat) => {
                  expect(err).toBe(null)
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
      fs.mkdir("/readlink", () => {
        fs.writeFile("/readlink/a.txt", "hello", () => {
          fs.symlink("/readlink/a.txt", "/readlink/b.txt", () => {
            fs.readlink("/readlink/b.txt", "utf8", (err, data) => {
              expect(err).toBe(null)
              expect(data).toBe("/readlink/a.txt")
              done();
            });
          });
        });
      });
    });
    it("readlink operates on paths with symlinks", done => {
      fs.mkdir("/readlink", () => {
        fs.symlink("/readlink", "/readlink/sub", () => {
          fs.writeFile("/readlink/c.txt", "hello", () => {
            fs.symlink("/readlink/c.txt", "/readlink/d.txt", () => {
              fs.readlink("/readlink/sub/d.txt", (err, data) => {
                expect(err).toBe(null)
                expect(data).toBe("/readlink/c.txt")
                done();
              });
            });
          });
        });
      });
    });
  });

  describe("du", () => {
    it("du returns the total file size of a path", done => {
      fs.mkdir("/du", () => {
        fs.writeFile("/du/a.txt", "hello", () => {
          fs.writeFile("/du/b.txt", "hello", () => {
            fs.mkdir("/du/sub", () => {
              fs.writeFile("/du/sub/a.txt", "hello", () => {
                fs.writeFile("/du/sub/b.txt", "hello", () => {
                  fs.du("/du/sub/a.txt", (err, size) => {
                    expect(err).toBe(null)
                    expect(size).toBe(5)
                    fs.du("/du/sub", (err, size) => {
                      expect(err).toBe(null)
                      expect(size).toBe(10)
                      fs.du("/du", (err, size) => {
                        expect(err).toBe(null)
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

});
