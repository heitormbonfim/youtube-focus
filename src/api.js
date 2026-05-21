'use strict';

const config = require('./config');
const logger = require('./lib/logger').make('api');

const { createServer, installShutdown } = require('./lib/http');
const { handleSearch }                  = require('./routes/search');
const { handleHealth }                  = require('./routes/health');

const ROUTES = [
  { method: 'GET', match: p => p === '/api/health', handler: handleHealth },
  { method: 'GET', match: p => p === '/api/search', handler: handleSearch },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  config.cors.allowOrigin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);

  for (const route of ROUTES) {
    if (route.method === method && route.match(pathname)) {
      return route.handler(req, res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function start() {
  return createServer({
    host: config.api.host,
    port: config.api.port,
    name: 'api',
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
