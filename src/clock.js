module.exports = function clock(name) {
  performance.mark(`${name} start`);
  return function stopClock() {
    performance.mark(`${name} end`);
    performance.measure(`${name}`, `${name} start`, `${name} end`);
  };
};
