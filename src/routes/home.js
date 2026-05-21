'use strict';

const path       = require('node:path');
const { render } = require('../services/template');
const config     = require('../config');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const TEMPLATE  = path.join(VIEWS_DIR, 'index.html');

function resolveApiUrl(req) {
  if (config.api.publicUrl) return config.api.publicUrl;

  const hostHeader = req.headers.host ?? `${config.web.host}:${config.web.port}`;
  const [hostname] = hostHeader.split(':');
  return `http://${hostname}:${config.api.port}`;
}

function renderHome(req, res) {
  const html = render(TEMPLATE, {
    appName: 'YouTube Focus',
    year:    String(new Date().getFullYear()),
    apiUrl:  resolveApiUrl(req),
  });

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

module.exports = { renderHome };
