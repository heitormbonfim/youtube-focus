'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Simple cache so templates are read from disk only once per process lifetime.
const cache = new Map();

/**
 * Minimal template engine using native Node.js only.
 *
 * Syntax:
 *   {{key}}          — replace with escaped string value
 *   {{{key}}}        — replace with raw (unescaped) HTML value
 *
 * @param {string} templatePath  Absolute path to the .html template file
 * @param {Record<string, string>} data  Key-value pairs to interpolate
 * @returns {string}  Rendered HTML string
 */
function render(templatePath, data = {}) {
  if (!cache.has(templatePath)) {
    cache.set(templatePath, fs.readFileSync(templatePath, 'utf8'));
  }

  let html = cache.get(templatePath);

  // {{{key}}} — raw HTML (unescaped), must come before {{key}} pass
  html = html.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) =>
    data[key] !== undefined ? String(data[key]) : ''
  );

  // {{key}} — HTML-escaped value
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined ? escape(String(data[key])) : ''
  );

  return html;
}

/** Escape characters that are unsafe inside HTML attribute values and text. */
function escape(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** Clear the template cache (useful if you edit templates during development). */
function clearCache() {
  cache.clear();
}

module.exports = { render, clearCache };
