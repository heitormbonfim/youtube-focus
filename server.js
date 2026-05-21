'use strict';

const http   = require('node:http');
const router = require('./src/router');

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.PORT ?? '3001', 10);

const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error('[error]', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`
  ██╗   ██╗████████╗    ███████╗ ██████╗  ██████╗██╗   ██╗███████╗
  ╚██╗ ██╔╝╚══██╔══╝    ██╔════╝██╔═══██╗██╔════╝██║   ██║██╔════╝
   ╚████╔╝    ██║       █████╗  ██║   ██║██║     ██║   ██║███████╗
    ╚██╔╝     ██║       ██╔══╝  ██║   ██║██║     ██║   ██║╚════██║
     ██║      ██║       ██║     ╚██████╔╝╚██████╗╚██████╔╝███████║
     ╚═╝      ╚═╝       ╚═╝      ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝

  ▶  YouTube Focus is running
  ─────────────────────────────────────────
  Local:   http://localhost:${PORT}
  ─────────────────────────────────────────
  Zero dependencies. Zero recommendations.
  Press Ctrl+C to stop.
  `);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗  Port ${PORT} is already in use. Stop the existing process first.\n`);
  } else {
    console.error('  ✗  Server error:', err.message);
  }
  process.exit(1);
});
