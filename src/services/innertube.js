'use strict';

const https = require('node:https');

// ─── Innertube client configuration ──────────────────────────────────────────
// These values mirror what youtube.com embeds in its own page source.
// If requests start failing, grab updated values from DevTools:
//   Network → any /youtubei/v1/ request → Request Payload → context.client
const CONFIG = {
  apiKey:        'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
  clientName:    'WEB',
  clientVersion: '2.20260521.00.00',
  hl:            'pt',
  gl:            'BR',
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/**
 * POST a JSON body to a YouTube Innertube endpoint.
 * Server-to-server: no CORS restrictions.
 *
 * @param {string} endpoint  e.g. 'search'
 * @param {object} body      merged with the required context object
 * @returns {Promise<object>}
 */
function innertubePost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      ...body,
      context: {
        client: {
          clientName:    CONFIG.clientName,
          clientVersion: CONFIG.clientVersion,
          hl:            CONFIG.hl,
          gl:            CONFIG.gl,
        },
      },
    });

    const options = {
      hostname: 'www.youtube.com',
      path:     `/youtubei/v1/${endpoint}?key=${CONFIG.apiKey}&prettyPrint=false`,
      method:   'POST',
      headers: {
        'Content-Type':             'application/json',
        'Content-Length':           Buffer.byteLength(payload),
        'X-YouTube-Client-Name':    '1',
        'X-YouTube-Client-Version': CONFIG.clientVersion,
        'Origin':                   'https://www.youtube.com',
        'User-Agent':               'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    };

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data',  chunk => chunks.push(chunk));
      res.on('end',   ()    => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid JSON from YouTube'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Response parsers ─────────────────────────────────────────────────────────

/**
 * Extract a VideoRenderer into a plain object.
 * @param {object} r  videoRenderer node
 * @returns {object|null}
 */
function parseVideoRenderer(r) {
  if (!r?.videoId) return null;

  const thumbs = r.thumbnail?.thumbnails ?? [];

  return {
    id:       r.videoId,
    title:    r.title?.runs?.[0]?.text                                    ?? '',
    channel:  r.ownerText?.runs?.[0]?.text                                ?? '',
    views:    r.viewCountText?.simpleText ?? r.viewCountText?.runs?.[0]?.text ?? '',
    pubDate:  r.publishedTimeText?.simpleText                             ?? '',
    duration: r.lengthText?.simpleText                                    ?? '',
    thumb:    thumbs[thumbs.length - 1]?.url                              ?? '',
  };
}

/**
 * Parse the response from a fresh search request.
 * @param {object} raw
 * @returns {{ videos: object[], continuationToken: string|null }}
 */
function parseSearchResults(raw) {
  const sections =
    raw?.contents
       ?.twoColumnSearchResultsRenderer
       ?.primaryContents
       ?.sectionListRenderer
       ?.contents ?? [];

  const videos = [];

  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents ?? []) {
      const video = parseVideoRenderer(item?.videoRenderer);
      if (video) videos.push(video);
    }
  }

  let continuationToken = null;
  for (const section of sections) {
    const token =
      section?.continuationItemRenderer
             ?.continuationEndpoint
             ?.continuationCommand?.token;
    if (token) { continuationToken = token; break; }
  }

  return { videos, continuationToken };
}

/**
 * Parse the response from a continuation (load-more) request.
 * @param {object} raw
 * @returns {{ videos: object[], continuationToken: string|null }}
 */
function parseContinuation(raw) {
  const items =
    raw?.onResponseReceivedCommands?.[0]
       ?.appendContinuationItemsAction
       ?.continuationItems ?? [];

  const videos = [];

  for (const item of items) {
    const renderer =
      item?.itemSectionRenderer?.contents?.[0]?.videoRenderer ??
      item?.videoRenderer;
    const video = parseVideoRenderer(renderer);
    if (video) videos.push(video);
  }

  let continuationToken = null;
  for (const item of items) {
    const token =
      item?.continuationItemRenderer
           ?.continuationEndpoint
           ?.continuationCommand?.token;
    if (token) { continuationToken = token; break; }
  }

  return { videos, continuationToken };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search YouTube via Innertube.
 * @param {string}      query
 * @param {string|null} continuationToken  pass to load next page
 * @returns {Promise<{ videos: object[], continuationToken: string|null }>}
 */
async function search(query, continuationToken = null) {
  if (continuationToken) {
    const raw = await innertubePost('search', { continuation: continuationToken });
    return parseContinuation(raw);
  }
  const raw = await innertubePost('search', { query });
  return parseSearchResults(raw);
}

module.exports = { search };
