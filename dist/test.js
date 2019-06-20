async function readwrite(i, value) {
  await fs.promises.writeFile(`/a.txt`, value)
  let result = await fs.promises.readFile(`/a.txt`, 'utf8')
  if (result !== value) {
    console.log(`${i} a.txt: wrote ${value} read ${result}`)
  }
}

async function test (fs, value) {
  try {
    await fs.promises.mkdir('/')
  } catch (e) {}
  for (let i = 0; i < 100; i++) {
    let p = readwrite(i, value)
    if (Math.random() > 0.75) await p
  }
}
