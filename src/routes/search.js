'use strict';

const { search } = require('../services/innertube');

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/**
 * GET /api/search?q=<query>[&continuation=<token>]
 *
 * Proxies the request to YouTube's Innertube API server-side,
 * bypassing browser CORS restrictions.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse}  res
 */
async function handleSearch(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const query            = (searchParams.get('q') ?? '').trim();
  const continuation     = searchParams.get('continuation') ?? null;

  if (!query && !continuation) {
    res.writeHead(400, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Query parameter "q" is required.' }));
    return;
  }

  try {
    const result = await search(query, continuation);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('[search route]', err.message);
    res.writeHead(502, JSON_HEADERS);
    res.end(JSON.stringify({ error: `YouTube upstream error: ${err.message}` }));
  }
}

module.exports = { handleSearch };
