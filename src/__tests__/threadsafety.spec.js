jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000
import FS from "../index.js";

const fs = new FS("testfs-worker", { wipe: true }).promises;

describe("thread safety", () => {
  it("launch a bunch of workers", (done) => {
    let workers = []
    let promises = []
    let numWorkers = 5
    fs.readdir('/').then(files => {
      expect(files.length).toBe(0);
      for (let i = 1; i <= numWorkers; i++) {
        let promise = new Promise(resolve => {
          let worker = new Worker('http://localhost:9876/base/src/__tests__/threadsafety.worker.js', {name: `worker_${i}`})
          worker.onmessage = (e) => {
            if (e.data && e.data.message === 'COMPLETE') resolve()
          }
          workers.push(worker)
        })
        promises.push(promise)
      }
      Promise.all(promises).then(() => {
        fs.readdir('/').then(files => {
          expect(files.length).toBe(5 * numWorkers)
          done();
        });
      });
    });
  });
});
