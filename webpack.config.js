const path = require('path')

module.exports = {
  target: "webworker",
  devtool: 'source-maps',
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "lightning-fs.min.js",
    library: "LightningFS",
    libraryTarget: "umd",
  },
};
