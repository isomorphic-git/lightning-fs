import FS from "../index.js";
import test from './fs.js';

const fs = new FS("testfs", { wipe: true });

test(fs);
