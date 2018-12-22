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
        fs.writeFile("/readFile/readFile-buffer.txt", "HELLO", err => {
          expect(err).toBe(null);
          fs.readFile("/readFile/readFile-buffer.txt", (err, data) => {
            expect(err).toBe(null);
            expect(data).toEqual(Buffer.from(HELLO));
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
});
