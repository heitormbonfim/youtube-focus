'use strict';

const stamp = () => new Date().toISOString();

function make(scope) {
  return {
    info:  (...args) => console.log  (`${stamp()} ${scope}  info`, ...args),
    warn:  (...args) => console.warn (`${stamp()} ${scope}  warn`, ...args),
    error: (...args) => console.error(`${stamp()} ${scope} error`, ...args),
  };
}

module.exports = { make };
