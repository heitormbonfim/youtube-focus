'use strict';

const path     = require('node:path');
const { render } = require('../services/template');

const VIEWS_DIR = path.join(__dirname, '..', 'views');

/**
 * GET /
 * Renders and serves the main application shell.
 *
 * @param {import('node:http').IncomingMessage} _req
 * @param {import('node:http').ServerResponse}   res
 */
function renderHome(_req, res) {
  const html = render(path.join(VIEWS_DIR, 'index.html'), {
    appName: 'YouTube Focus',
    year:    String(new Date().getFullYear()),
  });

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

module.exports = { renderHome };
