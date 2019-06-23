const sleep = ms => new Promise(r => setTimeout(r, ms))

const whoAmI = (typeof window === 'undefined' ? (self.name ? self.name : 'worker') : 'main' )+ ': '

async function readwrite(i, value) {
  await fs.promises.writeFile(`/a.txt`, value)
  let result = await fs.promises.readFile(`/a.txt`, 'utf8')
  if (result !== value) {
    console.log(`${i} a.txt: wrote ${value} read ${result}`)
  }
}

async function test (fs, value) {
  console.log(whoAmI + 'running')
  console.time(whoAmI)
  try {
    await fs.promises.mkdir('/')
  } catch (e) {}
  for (let i = 0; i < 100; i++) {
    let ps = []
    for (let j = 0; j < Math.random() * 10; j++) {
      ps.push(readwrite(`(${i}, ${j}):`, value))
    }
    await Promise.all(ps)
    if (Math.random() > 0.75) await sleep(100)
  }
  console.timeEnd(whoAmI)
  console.log(`%c ${whoAmI}DONE`, 'color: red; font-size: 16pt')
}
