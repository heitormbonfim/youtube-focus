'use strict';

const config = require('./config');
const logger = require('./lib/logger').make('web');

const { createServer, installShutdown } = require('./lib/http');
const { renderHome }                    = require('./routes/home');
const { serveStatic }                   = require('./services/static');

const ROUTES = [
  { method: 'GET', match: p => p === '/' || p === '/index.html', handler: renderHome  },
  { method: 'GET', match: p => p.startsWith('/public/'),         handler: serveStatic },
];

async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();

  for (const route of ROUTES) {
    if (route.method === method && route.match(pathname)) {
      return route.handler(req, res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

function start() {
  return createServer({
    host: config.web.host,
    port: config.web.port,
    name: 'web',
    handler,
    logger,
  });
}

if (require.main === module) {
  start()
    .then(server => installShutdown([server], logger))
    .catch(err => { logger.error('startup failed:', err.message); process.exit(1); });
}

module.exports = { start };
