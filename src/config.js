'use strict';

require('./lib/env').load();

const toInt = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',

  web: Object.freeze({
    host: process.env.WEB_HOST ?? '127.0.0.1',
    port: toInt(process.env.WEB_PORT, 12345),
  }),

  api: Object.freeze({
    host:      process.env.API_HOST ?? '127.0.0.1',
    port:      toInt(process.env.API_PORT, 12346),
    publicUrl: process.env.API_PUBLIC_URL ?? null,
  }),

  innertube: Object.freeze({
    apiKey:        process.env.INNERTUBE_API_KEY ?? 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    clientVersion: process.env.INNERTUBE_CLIENT_VERSION ?? '2.20260521.00.00',
    hl:            process.env.INNERTUBE_HL ?? 'en',
    gl:            process.env.INNERTUBE_GL ?? 'US',
    timeoutMs:     toInt(process.env.INNERTUBE_TIMEOUT_MS, 10_000),
  }),

  cors: Object.freeze({
    allowOrigin: process.env.CORS_ALLOW_ORIGIN ?? '*',
  }),
});

module.exports = config;
