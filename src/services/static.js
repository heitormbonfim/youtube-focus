'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.woff2':'font/woff2',
};

/**
 * Serve a file from /public/* safely.
 * Prevents directory traversal attacks by resolving the real path
 * and ensuring it stays inside PUBLIC_DIR.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse}  res
 */
function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  // Strip the /public prefix and resolve to the actual disk path
  const relative  = pathname.replace(/^\/public/, '');
  const filePath  = path.resolve(PUBLIC_DIR, '.' + relative);

  // Guard: reject any path that escapes PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) &&
      filePath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type':  mimeType,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(data);
  });
}

module.exports = { serveStatic };
