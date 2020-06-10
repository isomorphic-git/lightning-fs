import FS from "../index.js";
import test from './fs.promise.js';

const fs = new FS("testfs-promises", { wipe: true }).promises;

test(fs)
