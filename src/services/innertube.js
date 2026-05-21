'use strict';

const https  = require('node:https');
const config = require('../config');

const ENDPOINT_HOST = 'www.youtube.com';

const DEFAULT_HEADERS = {
  'Content-Type':          'application/json',
  'X-YouTube-Client-Name': '1',
  'Origin':                'https://www.youtube.com',
  'User-Agent':            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

function innertubePost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      ...body,
      context: {
        client: {
          clientName:    'WEB',
          clientVersion: config.innertube.clientVersion,
          hl:            config.innertube.hl,
          gl:            config.innertube.gl,
        },
      },
    });

    const options = {
      hostname: ENDPOINT_HOST,
      path:     `/youtubei/v1/${endpoint}?key=${config.innertube.apiKey}&prettyPrint=false`,
      method:   'POST',
      timeout:  config.innertube.timeoutMs,
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Length':           Buffer.byteLength(payload),
        'X-YouTube-Client-Version': config.innertube.clientVersion,
      },
    };

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end',  () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`upstream HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('invalid JSON from upstream'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`upstream timed out after ${config.innertube.timeoutMs}ms`));
    });

    req.write(payload);
    req.end();
  });
}

function parseVideoRenderer(r) {
  if (!r?.videoId) return null;

  const thumbs = r.thumbnail?.thumbnails ?? [];

  return {
    id:       r.videoId,
    title:    r.title?.runs?.[0]?.text                                          ?? '',
    channel:  r.ownerText?.runs?.[0]?.text                                      ?? '',
    views:    r.viewCountText?.simpleText ?? r.viewCountText?.runs?.[0]?.text   ?? '',
    pubDate:  r.publishedTimeText?.simpleText                                   ?? '',
    duration: r.lengthText?.simpleText                                          ?? '',
    thumb:    thumbs[thumbs.length - 1]?.url                                    ?? '',
  };
}

function extractContinuationToken(node) {
  return node?.continuationItemRenderer
              ?.continuationEndpoint
              ?.continuationCommand?.token ?? null;
}

function parseSearchResults(raw) {
  const sections =
    raw?.contents
       ?.twoColumnSearchResultsRenderer
       ?.primaryContents
       ?.sectionListRenderer
       ?.contents ?? [];

  const videos = [];
  let   continuationToken = null;

  for (const section of sections) {
    for (const item of section?.itemSectionRenderer?.contents ?? []) {
      const video = parseVideoRenderer(item?.videoRenderer);
      if (video) videos.push(video);
    }
    if (!continuationToken) continuationToken = extractContinuationToken(section);
  }

  return { videos, continuationToken };
}

function parseContinuation(raw) {
  const items =
    raw?.onResponseReceivedCommands?.[0]
       ?.appendContinuationItemsAction
       ?.continuationItems ?? [];

  const videos = [];
  let   continuationToken = null;

  for (const item of items) {
    const renderer =
      item?.itemSectionRenderer?.contents?.[0]?.videoRenderer ??
      item?.videoRenderer;
    const video = parseVideoRenderer(renderer);
    if (video) videos.push(video);
    if (!continuationToken) continuationToken = extractContinuationToken(item);
  }

  return { videos, continuationToken };
}

async function search(query, continuationToken = null) {
  if (continuationToken) {
    const raw = await innertubePost('search', { continuation: continuationToken });
    return parseContinuation(raw);
  }
  const raw = await innertubePost('search', { query });
  return parseSearchResults(raw);
}

module.exports = { search };
