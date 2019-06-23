const sleep = ms => new Promise(r => setTimeout(r, ms))

async function readwrite(i, value) {
  await fs.promises.writeFile(`/a.txt`, value)
  let result = await fs.promises.readFile(`/a.txt`, 'utf8')
  // console.log(`${i} a.txt`)
  if (result !== value) {
    console.log(`${i} a.txt: wrote ${value} read ${result}`)
  }
}

async function test (fs, value) {
  try {
    await fs.promises.mkdir('/')
  } catch (e) {}
  for (let i = 0; i < 100; i++) {
    let ps = []
    for (let j = 0; j < Math.random() * 10; j++) {
      ps.push(readwrite(`(${i}, ${j}):`, value))
    }
    await Promise.all(ps)
    if (Math.random() > 0.75) await sleep(75)
  }
}
