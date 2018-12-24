function SecondsNanoseconds(milliseconds) {
  if (milliseconds == null) {
    milliseconds = Date.now();
  }
  const seconds = Math.floor(milliseconds / 1000);
  const nanoseconds = (milliseconds - seconds * 1000) * 1000000;
  return [seconds, nanoseconds];
}

module.exports = class Stat {
  constructor(stats) {
    this.type = stats.type;
    this.mode = stats.mode;
    this.size = stats.size;
    const [mtimeSeconds, mtimeNanoseconds] = SecondsNanoseconds(stats.mtimeMs);
    const [ctimeSeconds, ctimeNanoseconds] = SecondsNanoseconds(stats.ctimeMs || stats.mtimeMs);
    this.mtimeSeconds = mtimeSeconds;
    this.ctimeSeconds = ctimeSeconds;
    this.mtimeNanoseconds = mtimeNanoseconds;
    this.ctimeNanoseconds = ctimeNanoseconds;

    this.uid = 1;
    this.gid = 1;
    this.dev = 1;
    this.ino = 1;
  }
  isDirectory() {
    return this.type === "dir";
  }
  isSymbolicLink() {
    return this.type === "symlink";
  }
};
