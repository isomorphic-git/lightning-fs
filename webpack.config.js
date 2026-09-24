const path = require('path')

module.exports = {
  mode: "production",
  target: "webworker",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "lightning-fs.min.js",
    library: "LightningFS",
    libraryTarget: "umd",
  },
};
