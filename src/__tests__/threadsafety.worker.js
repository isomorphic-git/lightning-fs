importScripts('http://localhost:9876/base/dist/lightning-fs.min.js');

self.fs = new LightningFS("testfs-worker").promises;

const sleep = ms => new Promise(r => setTimeout(r, ms))

const whoAmI = (typeof window === 'undefined' ? (self.name ? self.name : 'worker') : 'main' )+ ': '

async function writeFiles () {
  console.log(whoAmI + 'write stuff')
  // Chrome Mobile 67 and Mobile Safari 11 do not yet support named Workers
  let name = self.name || Math.random()
  await Promise.all([0, 1, 2, 3, 4].map(i => self.fs.writeFile(`/${name}_${i}.txt`, String(i))))
  self.postMessage({ message: 'COMPLETE' })
}

writeFiles()
