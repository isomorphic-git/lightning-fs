#! /usr/bin/env node
var fs = require('fs')
var path = require('path')
var symLinks = {}

module.exports = (dirpath) => {
  let str = "";
  const printTree = (root, indent) => {
    let files = fs.readdirSync(root)
    for (let file of files) {
      // Ignore itself
      if (file === '.superblock.txt') continue

      let fpath = `${root}/${file}`
      let lstat = fs.lstatSync(fpath)
      // Avoid infinite loops.
      if (lstat.isSymbolicLink()) {
        if (!symLinks[lstat.dev]) {
          symLinks[lstat.dev] = {}
        }
        // Skip this entry if we've seen it before
        if (symLinks[lstat.dev][lstat.ino]) {
          continue
        }
        symLinks[lstat.dev][lstat.ino] = true
      }
      let mode = lstat.mode.toString(8);
      str += `${"\t".repeat(indent)}`
      if (lstat.isDirectory()) {
        str += `${file}\t${mode}\n`;
        printTree(fpath, indent + 1);
      } else {
        str += `${file}\t${mode}\t${lstat.size}\t${lstat.mtimeMs}\n`;
      }
    }
  };
  printTree(dirpath, 0);
  return str;
}

if (!module.parent) {
  let filepath = process.cwd() + '/.superblock.txt'
  let contents = module.exports(process.cwd())
  fs.writeFileSync(filepath, contents)
}
