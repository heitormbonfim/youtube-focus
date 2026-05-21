'use strict';

const config = require('./config');
const logger = require('./lib/logger').make('main');
const banner = require('./lib/banner');

const { installShutdown } = require('./lib/http');
const web                 = require('./web');
const api                 = require('./api');

async function main() {
  const [webServer, apiServer] = await Promise.all([web.start(), api.start()]);
  installShutdown([webServer, apiServer], logger);

  process.stdout.write(banner({
    webUrl: `http://${config.web.host}:${config.web.port}`,
    apiUrl: `http://${config.api.host}:${config.api.port}`,
  }));
}

main().catch(err => {
  logger.error('startup failed:', err.message);
  process.exit(1);
});
