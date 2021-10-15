import FS from "../index.js";
import DexieBackend from "../DexieBackend";
import DefaultBackend from "../DefaultBackend";

const fs = new FS("testfs-dexie-promises-bulk", {
  wipe: true,
  backend: new DefaultBackend({
    idbBackendDelegate: (fileDbName, fileStoreName) => {
      return new DexieBackend(fileDbName, fileStoreName);
    },
  }),
}).promises;

const HELLO = new Uint8Array([72, 69, 76, 76, 79]);
const hello = new Uint8Array([104, 101, 108, 108, 111]);

if (!Promise.prototype.finally) {
  Promise.prototype.finally = function(onFinally) {
    this.then(onFinally, onFinally);
  };
}

describe("bulk::dexie::fs.promises module", () => {
  describe("bulk::dexie", () => {
    it("bulk", done => {
      fs.mkdir("/bulk").then(() => {
        fs.writeFileBulk([["/bulk/a.txt", "hello"], ["/bulk/b.txt", HELLO]]).then(() => {
          fs.readFileBulk(["/bulk/a.txt", "/bulk/b.txt"], { encoding: "utf8" }).then(files => {
            expect(files.length).toBe(2);
            expect(files[0]).toEqual(["/bulk/a.txt", "hello"]);
            expect(files[1]).toEqual(["/bulk/b.txt", "HELLO"]);
            fs.readFileBulk(["/bulk/a.txt", "/bulk/b.txt"]).then(files => {
              expect(files.length).toBe(2);
              expect(files[0]).toEqual(["/bulk/a.txt", hello]);
              expect(files[1]).toEqual(["/bulk/b.txt", HELLO]);
              fs.unlinkBulk(["/bulk/a.txt", "/bulk/b.txt"]).then(() => {
                fs.readdir("/bulk").then(files => {
                  expect(files.length).toBe(0);
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
