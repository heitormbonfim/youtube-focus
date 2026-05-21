'use strict';

const { serveStatic }  = require('./services/static');
const { renderHome }   = require('./routes/home');
const { handleSearch } = require('./routes/search');

/** @type {Array<{method: string, match: (p: string) => boolean, handler: Function}>} */
const ROUTES = [
  { method: 'GET', match: p => p === '/' || p === '/index.html', handler: renderHome   },
  { method: 'GET', match: p => p === '/api/search',              handler: handleSearch  },
  { method: 'GET', match: p => p.startsWith('/public/'),         handler: serveStatic   },
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Main request router.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse}  res
 */
async function router(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();

  // Pre-flight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Attach CORS headers to every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  for (const route of ROUTES) {
    if (route.method === method && route.match(pathname)) {
      return route.handler(req, res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

module.exports = router;
