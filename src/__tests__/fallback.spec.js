import FS from "../index.js";

const fs = new FS("fallbackfs", { wipe: true, url: 'http://localhost:9876/base/src/__tests__/__fixtures__/test-folder' });

describe("http fallback", () => {
  it("sanity check", () => {
    expect(fs.promises._http).not.toBeFalsy()
  })
  it("loads", (done) => {
    fs.promises._activate().then(() => {
      done()
    }).catch(err => {
      expect(err).toBe(null)
      done()
    })
  })
  describe("readdir", () => {
    it("read root dir", done => {
      fs.readdir("/", (err, data) => {
        expect(err).toBe(null);
        expect(data).toEqual(['0', '1', 'a.txt', 'b.txt', 'c.txt'])
        done();
      });
    });
    it("read child dir", done => {
      fs.readdir("/1", (err, data) => {
        expect(err).toBe(null);
        expect(data).toEqual(['d.txt', 'e.txt', 'f.txt'])
        done();
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
    it("read file /a.txt", done => {
      fs.readFile("/a.txt", 'utf8', (err, data) => {
        expect(err).toBe(null);
        expect(data).toEqual('Hello from "a"');
        done();
      });
    });
    it("read file /1/d.txt", done => {
      fs.readFile("/1/d.txt", 'utf8', (err, data) => {
        expect(err).toBe(null);
        expect(data).toEqual('Hello from "d"');
        done();
      });
    });
  });

  describe("writeFile", () => {
    it("writing a file overwrites the server version", done => {
      fs.writeFile("/b.txt", "welcome", (err) => {
        expect(err).toBe(null)
        fs.readFile("/b.txt", 'utf8', (err, data) => {
          expect(err).toBe(null);
          expect(data).toEqual('welcome');
          done();
        });
      });
    });
  });

  describe("unlink", () => {
    it("deleting a file should make the file appear deleted", done => {
      fs.unlink("/0/a.txt", (err) => {
        fs.readFile("/0/a.txt", 'utf8', (err) => {
          expect(err).not.toBe(null);
          expect(err.code).toEqual('ENOENT');
          fs.readdir("/0", (err, data) => {
            expect(err).toBe(null)
            expect(data).toEqual(["b.txt", "c.txt"])
            done();
          });
        });
      });
    });
  });
});
