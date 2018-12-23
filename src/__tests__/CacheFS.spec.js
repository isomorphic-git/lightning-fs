import CacheFS from "../CacheFS";

const fs = new CacheFS();

const treeText = require('./__fixtures__/tree.txt.js');

describe("CacheFS module", () => {
  it("print ∘ parse == id", () => {
    let parsed = fs.parse(treeText)
    let text = fs.print(parsed)
    expect(text).toEqual(treeText)
  });
});
