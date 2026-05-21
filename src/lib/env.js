'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const QUOTED = /^(['"])(.*)\1$/;

function load(file = '.env') {
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');

  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key   = line.slice(0, eq).trim();
    let   value = line.slice(eq + 1).trim();

    const quoted = value.match(QUOTED);
    if (quoted) value = quoted[2];

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { load };
