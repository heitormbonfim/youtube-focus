'use strict';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const STARTED_AT   = Date.now();

function handleHealth(_req, res) {
  const body = {
    status:    'ok',
    service:   'youtube-focus-api',
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
  };

  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

module.exports = { handleHealth };
