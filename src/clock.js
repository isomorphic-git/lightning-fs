const where = typeof window === 'undefined' ? 'worker' : 'main'

module.exports = function clock(name) {
  performance.mark(`${name} start`);
  console.log(`${where}: ${name}`)
  console.time(`${where}: ${name}`)
  return function stopClock() {
    performance.mark(`${name} end`);
    console.timeEnd(`${where}: ${name}`)
    performance.measure(`${name}`, `${name} start`, `${name} end`);
  };
};
