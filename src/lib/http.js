'use strict';

const http = require('node:http');

const SHUTDOWN_GRACE_MS = 10_000;

function createServer({ host, port, handler, name, logger }) {
  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(err => {
        logger.error(`[${name}] unhandled request error:`, err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
        }
      });
  });

  return new Promise((resolve, reject) => {
    const onStartupError = err => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`[${name}] port ${port} is already in use`);
      }
      reject(err);
    };

    server.once('error', onStartupError);
    server.listen(port, host, () => {
      server.off('error', onStartupError);
      server.on('error', err => logger.error(`[${name}] runtime server error:`, err.message));
      logger.info(`[${name}] listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}

function installShutdown(servers, logger) {
  let shuttingDown = false;

  const close = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);

    let remaining = servers.length;
    for (const srv of servers) {
      srv.close(() => {
        remaining -= 1;
        if (remaining === 0) process.exit(0);
      });
    }

    setTimeout(() => {
      logger.warn(`graceful shutdown timed out after ${SHUTDOWN_GRACE_MS}ms — forcing exit`);
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  process.on('SIGTERM', () => close('SIGTERM'));
  process.on('SIGINT',  () => close('SIGINT'));
}

module.exports = { createServer, installShutdown };
