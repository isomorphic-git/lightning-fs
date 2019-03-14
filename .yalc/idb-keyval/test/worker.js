
import { update } from "../dist/idb-keyval.mjs";

update("lock", value => {
  if (value === undefined) {
    console.log('LOCKED BY WORKER')
    return "LOCKED BY WORKER"
  } else {
    console.log(value)
    return value;
  }
});
