<div align="center">

# YouTube Focus

**YouTube without distractions. No recommendations, no noise — just what you searched for.**

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518.0-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](https://www.docker.com/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

</div>

---

## Overview

**YouTube Focus** is a minimal, single-purpose YouTube client that strips away
everything you didn't ask for: no recommendation feed, no autoplay tunnels, no
"trending" sidebar, no comments — just the videos that match the search you
just typed. Built as two tiny Node.js HTTP services with **zero runtime
dependencies**, it is deliberately small enough to read end-to-end in an
afternoon and self-host on a Raspberry Pi.

The project consists of two cooperating services that run side by side:

| Service | Default port | Responsibility                                                                                |
| ------- | ------------ | --------------------------------------------------------------------------------------------- |
| `web`   | **12345**    | Serves the static HTML / CSS / JS frontend and injects runtime configuration.                 |
| `api`   | **12346**    | Server-side proxy to YouTube's Innertube search API; exposes `/api/search` and `/api/health`. |

Ports were chosen well outside the common `3000`/`8000`/`8080` development
range so the app coexists peacefully with whatever else is running on your
machine.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
  - [Run with Docker (recommended)](#run-with-docker-recommended)
  - [Run with Node.js](#run-with-nodejs)
- [Auto-start on boot](#auto-start-on-boot)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Development](#development)
- [Maintaining the Innertube client](#maintaining-the-innertube-client)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Distraction-free playback** — every recommendation, end-screen, and
  annotation surface is masked at the DOM layer; the player itself runs with
  `rel=0`, `modestbranding=1` and `iv_load_policy=3`.
- **Server-side search** — Innertube calls happen on the Node server, so the
  browser is never exposed to YouTube's tracking endpoints or CORS limits.
- **Continuation / "load more"** — the API forwards continuation tokens so
  you can page through results without re-issuing the original query.
- **Keyboard-first UI** — <kbd>Enter</kbd> to search, <kbd>F</kbd> for
  fullscreen, <kbd>Esc</kbd> to close.
- **Health endpoint** — `/api/health` returns `{ status: "ok", uptimeSec }`
  for liveness probes and the frontend's status pill.
- **Zero npm dependencies** — production runtime is `node:20-alpine` plus
  ~600 lines of project code.
- **Production-ready container** — multi-stage `Dockerfile`, unprivileged
  user, native `HEALTHCHECK`, log rotation, and `restart: unless-stopped`.

---

## Architecture

```
                ┌──────────────────────────────────────────────┐
                │                  Browser                     │
                │  http://localhost:12345  (UI)                │
                └──────────────────────┬───────────────────────┘
                                       │  HTML / static assets
                                       ▼
                  ┌────────────────────────────────────────┐
                  │   web service  ::  src/web.js          │
                  │   ─ renders index.html + injects       │
                  │     __YTF_API_URL__                    │
                  │   ─ serves /public/{app.js,style.css}  │
                  │   ─ listens on WEB_PORT (12345)        │
                  └─────────────────┬──────────────────────┘
                                    │  XHR  ── fetch(`${API_URL}/api/search`)
                                    ▼
                  ┌────────────────────────────────────────┐
                  │   api service  ::  src/api.js          │
                  │   ─ GET /api/health   (liveness)       │
                  │   ─ GET /api/search   (proxy)          │
                  │   ─ listens on API_PORT (12346)        │
                  └─────────────────┬──────────────────────┘
                                    │  HTTPS POST
                                    ▼
                  ┌────────────────────────────────────────┐
                  │   www.youtube.com/youtubei/v1/search   │
                  └────────────────────────────────────────┘
```

Both services can run in a single Node process (`node src/index.js`, the
default Docker `CMD`) or as two independent processes (`node src/web.js` and
`node src/api.js`) — useful if you want to put them on different machines or
behind separate reverse proxies.

---

## Quick start

### Requirements

- **Docker 24+** with the Compose plugin, **or**
- **Node.js 18+** (no `npm install` required — the project has zero deps)

### Run with Docker (recommended)

```bash
git clone <repo-url> youtube-focus
cd youtube-focus
cp .env.example .env          # tweak ports/locale if desired

docker compose up -d --build
```

Then open <http://localhost:12345>.

Verify both services are healthy:

```bash
docker compose ps
curl -s http://localhost:12346/api/health | head
```

To stop:

```bash
docker compose down
```

### Run with Node.js

```bash
git clone <repo-url> youtube-focus
cd youtube-focus
cp .env.example .env          # optional

# Run both services in one process
npm start

# …or run them separately in two terminals
npm run start:web
npm run start:api
```

Open <http://localhost:12345>.

---

## Auto-start on boot

The bundled `docker-compose.yml` sets `restart: unless-stopped`, which means
the container is automatically restarted by the Docker daemon every time it
starts — including on system boot — unless you explicitly stopped it with
`docker compose down` or `docker stop`.

For this to take effect across reboots you need Docker itself to start at
boot. Enable it once:

```bash
# Linux (systemd):
sudo systemctl enable --now docker

# macOS / Windows: open Docker Desktop → Settings → "Start Docker Desktop when you log in"
```

After that, `docker compose up -d` is a one-time action. The next reboot will
bring YouTube Focus back online automatically, with no further intervention.

To temporarily disable auto-start without removing the container:

```bash
docker compose stop          # remains stopped across reboots
docker compose start         # resume
```

---

## Configuration

All configuration is via environment variables (loaded automatically from
`.env` if present). Every variable has a sensible default — you can run the
app with no `.env` at all.

| Variable                   | Default                                  | Description                                                              |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                 | `development`                            | `development` or `production`.                                           |
| `WEB_HOST`                 | `127.0.0.1` (local) / `0.0.0.0` (Docker) | Interface the web server binds to.                                       |
| `WEB_PORT`                 | `12345`                                  | Port the web server listens on.                                          |
| `API_HOST`                 | `127.0.0.1` (local) / `0.0.0.0` (Docker) | Interface the API server binds to.                                       |
| `API_PORT`                 | `12346`                                  | Port the API server listens on.                                          |
| `API_PUBLIC_URL`           | _(auto-derived from request `Host`)_     | Absolute URL the browser uses to reach the API. Set when behind a proxy. |
| `INNERTUBE_API_KEY`        | _(bundled web key)_                      | Public YouTube web client key.                                           |
| `INNERTUBE_CLIENT_VERSION` | `2.20260521.00.00`                       | Client version reported to Innertube.                                    |
| `INNERTUBE_HL`             | `en`                                     | Interface language code.                                                 |
| `INNERTUBE_GL`             | `US`                                     | Geo / region code.                                                       |
| `INNERTUBE_TIMEOUT_MS`     | `10000`                                  | Upstream request timeout in milliseconds.                                |
| `CORS_ALLOW_ORIGIN`        | `*`                                      | `Access-Control-Allow-Origin` returned by the API.                       |

See [`.env.example`](./.env.example) for a copy-pasteable starting point.

---

## API reference

The API service exposes two `GET` endpoints, both returning JSON.

### `GET /api/health`

Liveness probe.

```http
GET /api/health HTTP/1.1
```

```json
{ "status": "ok", "service": "youtube-focus-api", "uptimeSec": 42 }
```

### `GET /api/search`

Search YouTube. The first call uses `q`; subsequent pages use the
`continuationToken` returned from the previous response.

| Parameter      | Type   | Required         | Description                              |
| -------------- | ------ | ---------------- | ---------------------------------------- |
| `q`            | string | yes (first call) | The search query.                        |
| `continuation` | string | yes (subsequent) | Token returned in the previous response. |

```http
GET /api/search?q=lo-fi%20hip%20hop HTTP/1.1
```

```json
{
  "videos": [
    {
      "id": "jfKfPfyJRdk",
      "title": "lofi hip hop radio 📚 - beats to relax/study to",
      "channel": "Lofi Girl",
      "views": "1.2B views",
      "pubDate": "Streamed 3 years ago",
      "duration": "LIVE",
      "thumb": "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg"
    }
  ],
  "continuationToken": "EpsDEgxsby1maSBoaXAg…"
}
```

**Error responses**

| Status | Body                                               | When                                         |
| ------ | -------------------------------------------------- | -------------------------------------------- |
| `400`  | `{ "error": "query parameter \"q\" is required" }` | Neither `q` nor `continuation` was provided. |
| `502`  | `{ "error": "upstream unavailable" }`              | The Innertube call failed or timed out.      |

---

## Project structure

```
youtube-focus/
├── Dockerfile                  Hardened production image
├── docker-compose.yml          Single-container orchestration with auto-restart
├── .env.example                Documented configuration template
├── .gitignore / .dockerignore  VCS / build exclusions
├── .editorconfig               Consistent formatting across editors
├── LICENSE                     MIT
├── README.md                   You are here
├── package.json                Scripts + metadata (zero dependencies)
└── src/
    ├── index.js                Combined entry — runs web + api in one process
    ├── web.js                  Web service entry (static frontend)
    ├── api.js                  API service entry (Innertube proxy)
    ├── config.js               Frozen config object hydrated from env vars
    ├── lib/
    │   ├── env.js              Zero-dep .env loader
    │   ├── logger.js           ISO-timestamped scoped logger
    │   ├── http.js             createServer() + installShutdown()
    │   └── banner.js           Startup banner
    ├── routes/
    │   ├── home.js             GET /             → renders index.html
    │   ├── search.js           GET /api/search   → calls innertube service
    │   └── health.js           GET /api/health   → liveness probe
    ├── services/
    │   ├── innertube.js        YouTube Innertube client + response parsers
    │   ├── template.js         Minimal {{var}} / {{{raw}}} template engine
    │   └── static.js           Safe static file server (path-traversal guarded)
    ├── views/
    │   └── index.html          Application shell template
    └── public/
        ├── app.js              Frontend state machine, modal, player, search
        └── style.css           Dark-mode UI mirroring YouTube design tokens
```

---

## Development

### Run with file-watch

```bash
npm run dev
```

This runs `node --watch src/index.js`, restarting on any change under `src/`.

### Inspect logs in Docker

```bash
docker compose logs -f youtube-focus
```

### Useful scripts

| Command                | Purpose                               |
| ---------------------- | ------------------------------------- |
| `npm start`            | Run both services in one Node process |
| `npm run start:web`    | Run only the web service              |
| `npm run start:api`    | Run only the API service              |
| `npm run dev`          | Run with `--watch` for hot reload     |
| `npm run docker:build` | `docker compose build`                |
| `npm run docker:up`    | `docker compose up -d`                |
| `npm run docker:down`  | `docker compose down`                 |
| `npm run docker:logs`  | `docker compose logs -f`              |

### Coding conventions

- CommonJS (`'use strict'` at the top of every module).
- Two-space indent, single quotes, trailing commas. Enforced by
  `.editorconfig`.
- Files at module boundaries declare their public surface via
  `module.exports`; everything else stays private.
- HTML rendered server-side is escaped via `services/template.js`; HTML
  rendered client-side uses the `escHtml()` helper in `public/app.js`. Never
  concatenate raw user input into markup.

---

## Maintaining the Innertube client

YouTube Focus talks to YouTube via the **Innertube** API — the same private
JSON API the official `youtube.com` web app calls. The endpoint isn't
documented or versioned for third-party use, so from time to time YouTube
rolls out a new web client and rejects requests that still identify
themselves as the old one. When that happens, **searches start returning
`502 upstream unavailable`** even though everything in your stack is fine.

The fix is to copy the new values out of your own browser into `.env`. It
takes about 60 seconds and never requires changing any code.

### What can go stale

| Variable                        | Where it lives           | How often it changes         | Symptom when stale                                 |
| ------------------------------- | ------------------------ | ---------------------------- | -------------------------------------------------- |
| `INNERTUBE_API_KEY`             | URL query string         | Rarely (years, historically) | `401`/`403` from upstream                          |
| `INNERTUBE_CLIENT_VERSION`      | Request `context.client` | Often (roughly weekly)       | Empty `videos` array, or `400`/`410` from upstream |
| `INNERTUBE_HL` / `INNERTUBE_GL` | Request `context.client` | Never (set by you)           | Wrong-language or geo-restricted results           |

The current defaults baked into [`src/config.js`](./src/config.js) are a
known-good snapshot at the time of release. They will eventually go stale —
this section is how you refresh them.

### Step-by-step: refresh the client version (the common case)

1. Open <https://www.youtube.com> in **Chrome, Edge, Firefox, or any
   Chromium-based browser**.
2. Press <kbd>F12</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> /
   <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> on macOS) to open DevTools.
3. Click the **Network** tab. If you see no traffic, reload the page with
   the DevTools panel open.
4. In the filter bar, type:

   ```
   youtubei/v1
   ```

   This narrows the list to Innertube calls. Search the YouTube page for
   anything (top-right search bar) to guarantee at least one `search`
   request appears.
5. Click any request whose name starts with `search?key=…`.
6. Switch to the **Payload** tab (Chrome/Edge) or **Request** tab (Firefox).
   You will see a JSON body like:

   ```json
   {
     "context": {
       "client": {
         "hl": "en",
         "gl": "US",
         "clientName": "WEB",
         "clientVersion": "2.20260521.00.00",
         "...": "..."
       }
     },
     "query": "..."
   }
   ```

7. Copy the value of `clientVersion` (the string that looks like
   `2.YYYYMMDD.NN.NN`).
8. Open `.env` (create it from `.env.example` if you don't have one yet) and
   set:

   ```env
   INNERTUBE_CLIENT_VERSION=2.20260521.00.00
   ```

9. Restart the app:

   ```bash
   # Docker
   docker compose restart youtube-focus
   # …or, without Docker
   npm start
   ```

10. Hit <http://localhost:12346/api/health> to confirm the API is up, then
    run a real search through the UI. You should see results again.

### Step-by-step: refresh the API key (rare)

Most outages do **not** require this — try the client-version refresh first.
But if upstream is returning `401`/`403` even with a fresh client version,
the API key itself has rotated.

1. With DevTools still on the Network tab and `youtubei/v1` filter applied,
   click the same `search?key=…` request.
2. Switch to the **Headers** tab.
3. Under **General → Request URL**, you'll see something like:

   ```
   https://www.youtube.com/youtubei/v1/search?key=AIzaSy...&prettyPrint=false
   ```

4. Copy everything between `key=` and the next `&` — that's the key.
5. Set in `.env`:

   ```env
   INNERTUBE_API_KEY=AIzaSy...
   ```

6. Restart the app as above.

> **Heads-up.** This key is a _public web-client identifier_, not a secret
> credential — it's literally embedded in every `youtube.com` page source.
> It does not grant any quota or billing privileges beyond what an anonymous
> visitor already has.

### Alternative: read the values straight out of the page source

If DevTools intimidates you, you can grab both values from a single
`curl`:

```bash
curl -s https://www.youtube.com | grep -oE 'INNERTUBE_(API_KEY|CLIENT_VERSION)":"[^"]+"' | head -2
```

Example output:

```
INNERTUBE_API_KEY":"AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
INNERTUBE_CLIENT_VERSION":"2.20260521.00.00"
```

Copy the values into your `.env` and restart.

### How to tell _before_ a real outage

The Innertube response shape we depend on (the `twoColumnSearchResultsRenderer`
path in [`src/services/innertube.js`](./src/services/innertube.js)) is also
versioned by YouTube. If a search returns `HTTP 200` but `videos: []` for an
obviously-popular query, the response _structure_ has likely changed — open
an issue and paste the raw JSON (you can `curl` the API directly:
`curl 'http://localhost:12346/api/search?q=test' | jq`).

### Quick maintenance cheat-sheet

| Symptom                                             | Most-likely fix                                           |
| --------------------------------------------------- | --------------------------------------------------------- |
| `502 upstream unavailable` on every search          | Refresh `INNERTUBE_CLIENT_VERSION` from DevTools.         |
| `502` _and_ DevTools shows `401`/`403` from YouTube | Refresh `INNERTUBE_API_KEY` too.                          |
| `200` but empty `videos` array                      | Response shape has shifted — file an issue with raw JSON. |
| Wrong-language titles / regional restrictions       | Set `INNERTUBE_HL` and `INNERTUBE_GL` in `.env`.          |
| Timeouts on slow connections                        | Increase `INNERTUBE_TIMEOUT_MS` (default `10000`).        |

---

## Security notes

- **The Innertube API key shipped here is the same one YouTube embeds in
  every web page source** — it is a public, non-secret identifier of the web
  client and grants no special privileges. The project ships it for
  convenience; override it via `INNERTUBE_API_KEY` if you prefer.
- **The static file server in [`src/services/static.js`](./src/services/static.js)
  rejects any request whose resolved disk path falls outside `src/public/`**,
  defending against directory-traversal attempts (`/public/../etc/passwd`).
- **CORS** defaults to `*` so the API is usable from any local origin during
  development. **In any deployment exposed beyond `localhost`, set
  `CORS_ALLOW_ORIGIN` to the exact frontend origin.**
- **The container runs as a non-root user (`app:app`)**, with the source
  tree owned by that user; even with a remote-code-execution bug in Node,
  the blast radius is limited.
- **Upstream errors are not propagated verbatim** to clients — the API
  returns a generic `502 upstream unavailable` and logs the detailed cause
  server-side.

---

## Troubleshooting

<details>
<summary><strong>The UI loads but every search returns "upstream unavailable"</strong></summary>

YouTube has almost certainly rotated the Innertube client version. See
[Maintaining the Innertube client](#maintaining-the-innertube-client) for a
step-by-step refresh — it takes about 60 seconds and never requires a code
change.

</details>

<details>
<summary><strong>Port already in use (`EADDRINUSE`)</strong></summary>

Either stop the process holding the port (`lsof -i :12345`) or override the
port in `.env`:

```env
WEB_PORT=23456
API_PORT=23457
API_PUBLIC_URL=http://localhost:23457
```

</details>

<details>
<summary><strong>The status pill shows "offline" even though the API is running</strong></summary>

The browser is probably hitting the wrong API URL. The web server derives the
API URL from the request's `Host` header by default; if you're accessing the
app via an unusual hostname (a LAN IP, a reverse proxy, …) set
`API_PUBLIC_URL` explicitly so the frontend uses the correct origin.

</details>

<details>
<summary><strong>Docker container restarts in a loop</strong></summary>

Check `docker compose logs youtube-focus`. The most common cause is a port
collision on the host: pick different host-side ports in `.env` and
re-run `docker compose up -d`.

</details>

---

## License

[MIT](./LICENSE) — see the `LICENSE` file for the full text.

> **Disclaimer.** This project is an independent, non-commercial tool. It is
> not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. All
> video content is fetched from YouTube's own public endpoints and remains
> subject to YouTube's Terms of Service.
