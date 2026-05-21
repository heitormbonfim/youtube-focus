'use strict';

const { search } = require('../services/innertube');
const logger     = require('../lib/logger').make('api');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

async function handleSearch(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const query        = (searchParams.get('q') ?? '').trim();
  const continuation = searchParams.get('continuation') ?? null;

  if (!query && !continuation) {
    res.writeHead(400, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'query parameter "q" is required' }));
    return;
  }

  try {
    const result = await search(query, continuation);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  } catch (err) {
    logger.error('search request failed:', err.message);
    res.writeHead(502, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}

module.exports = { handleSearch };
