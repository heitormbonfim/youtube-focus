/* ══════════════════════════════════════════════════════════════════
   YouTube Focus — Frontend
   The API base URL is injected at render time by the web server
   (see src/routes/home.js). The API service exposes /api/search and
   /api/health on a separate port, proxying YouTube's Innertube API
   server-side to bypass browser CORS restrictions.
   ══════════════════════════════════════════════════════════════════ */

'use strict';

// ── API base URL (injected by server template) ───────────────────────────────
const API_URL = (typeof window !== 'undefined' && window.__YTF_API_URL__) || '';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  query:             '',
  continuationToken: null,
  loadingMore:       false,
  serverOnline:      false,
  player:            null,   // YT.Player instance
  ytApiReady:        false,
  pendingVideo:      null,   // { video, position, autoplay } buffered while API loads
  currentVideo:      null,   // the video object currently open in the modal
};

let _posTimer = null;        // interval id for periodic position persistence

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  header:        $('header'),
  hero:          $('hero'),
  loading:       $('loading'),
  results:       $('results'),
  resultsMeta:   $('results-meta'),
  resultsGrid:   $('results-grid'),
  loadMoreWrap:  $('load-more-wrap'),
  loadMoreBtn:   $('load-more-btn'),
  modal:         $('modal'),
  modalBackdrop: $('modal-backdrop'),
  modalTitle:    $('modal-title'),
  fsBtn:         $('fs-btn'),
  fsIcon:        $('fs-icon'),
  closeBtn:      $('close-btn'),
  playerWrap:    $('player-wrap'),
  overlayPause:  $('overlay-pause'),
  overlayEnd:    $('overlay-end'),
  replayBtn:     $('replay-btn'),
  backBtn:       $('back-btn'),
  headerInput:   $('search-input'),
  headerBtn:     $('search-btn'),
  heroInput:     $('hero-input'),
  heroBtn:       $('hero-btn'),
  statusPill:    $('status-pill'),
  statusLabel:   $('status-label'),
  toast:         $('toast'),
  recent:        $('recent'),
  recentGrid:    $('recent-grid'),
  recentClear:   $('recent-clear'),
};

// ── Persistence (localStorage) ──────────────────────────────────────────────
// Best-effort: every read/write is guarded so the app works identically when
// storage is unavailable (private mode / quota exceeded).
const STORE_KEY    = 'ytf:session:v1';
const RESULTS_CAP  = 60;
const RECENT_CAP   = 10;

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    return (data && data.version === 1) ? data : { version: 1, recent: [] };
  } catch {
    return { version: 1, recent: [] };
  }
}

function saveStore(patch) {
  try {
    const next = { ...loadStore(), ...patch, version: 1 };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch { /* quota / unavailable — ignore */ }
}

// Trim a video to the fields we persist (keeps storage small + predictable).
function slimVideo(v) {
  return {
    id:       v.id,
    title:    v.title    ?? '',
    channel:  v.channel  ?? '',
    views:    v.views    ?? '',
    pubDate:  v.pubDate  ?? '',
    duration: v.duration ?? '',
    thumb:    v.thumb    ?? '',
  };
}

// Insert/update a video at the front of the recent list (dedupe by id, cap N).
function upsertRecent(video, position = 0, duration = 0) {
  const store  = loadStore();
  const recent = Array.isArray(store.recent) ? store.recent : [];
  const prev   = recent.find(r => r.id === video.id);
  const entry  = {
    ...slimVideo(video),
    position,
    duration: duration || prev?.duration || 0,   // keep known duration
    updatedAt: Date.now(),
  };
  const next   = [entry, ...recent.filter(r => r.id !== video.id)].slice(0, RECENT_CAP);
  saveStore({ recent: next });
}

// Update the saved position for the currently-open video (current + recent).
function persistPosition() {
  const v = state.currentVideo;
  if (!v || !state.player) return;
  let position, duration;
  try {
    position = state.player.getCurrentTime?.() ?? 0;
    duration = state.player.getDuration?.()    ?? 0;
  } catch { return; }
  if (!Number.isFinite(position)) return;

  const store  = loadStore();
  const recent = (store.recent ?? []).map(r =>
    r.id === v.id ? { ...r, position, duration, updatedAt: Date.now() } : r);
  saveStore({
    current: { id: v.id, title: v.title, position, duration, updatedAt: Date.now() },
    recent,
  });
}

function startPositionTimer() {
  stopPositionTimer();
  _posTimer = setInterval(persistPosition, 5000);
}

function stopPositionTimer() {
  if (_posTimer) { clearInterval(_posTimer); _posTimer = null; }
}

// Forget the actively-watched video so it won't auto-reopen, but keep history.
function clearCurrent() {
  saveStore({ current: null });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  checkServer();
  restoreSession();
});

// Rebuild the previous session from localStorage: cached results grid, the
// recently-watched row, and (if any) auto-reopen the last video — paused.
function restoreSession() {
  const store = loadStore();

  renderRecent(store.recent ?? []);

  if (store.query && Array.isArray(store.videos) && store.videos.length) {
    state.query           = store.query;
    dom.headerInput.value = store.query;
    dom.resultsMeta.textContent = `Results for "${store.query}"`;
    renderCards(store.videos, true);
    state.continuationToken = null;
    dom.loadMoreWrap.style.display = 'none';
    showResults();
  } else {
    showHero();
  }

  // Auto-reopen the last watched video, paused at its saved position.
  if (store.current?.id) {
    const fromRecent = (store.recent ?? []).find(r => r.id === store.current.id);
    const video = fromRecent ?? { id: store.current.id, title: store.current.title };
    openModal(video, { position: store.current.position ?? 0, autoplay: false });
  }
}

// ── Server health check ───────────────────────────────────────────────────────
async function checkServer() {
  setStatus('checking');
  try {
    const r = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    state.serverOnline = true;
    setStatus('ok');
  } catch {
    state.serverOnline = false;
    setStatus('fail');
  }
}

function setStatus(type) {
  const pill = dom.statusPill;
  pill.className = 'status-pill status-' + type;
  dom.statusLabel.textContent = { checking: 'connecting…', ok: 'connected', fail: 'offline' }[type];
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showHero() {
  dom.hero.classList.add('visible');
  dom.header.classList.add('home');     // hide the header's duplicate search bar
  dom.results.classList.remove('visible');
  dom.loading.classList.remove('visible');
  dom.loadMoreWrap.style.display = 'none';
}

function showResults() {
  dom.hero.classList.remove('visible');
  dom.header.classList.remove('home');  // header search bar takes over in results view
  dom.results.classList.add('visible');
}

// ── Search ────────────────────────────────────────────────────────────────────
async function doSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) return;
  if (!state.serverOnline) { toast('Server offline — make sure the API service is running'); return; }

  state.query             = query;
  state.continuationToken = null;

  dom.resultsGrid.innerHTML   = '';
  dom.resultsMeta.textContent = '';
  dom.loadMoreWrap.style.display = 'none';
  dom.headerInput.value = query;

  showResults();
  await fetchPage(false);
}

async function loadMore() {
  if (state.loadingMore || !state.continuationToken) return;
  state.loadingMore = true;
  dom.loadMoreBtn.disabled    = true;
  dom.loadMoreBtn.textContent = 'Loading…';
  await fetchPage(true);
  dom.loadMoreBtn.disabled    = false;
  dom.loadMoreBtn.textContent = 'Show more';
  state.loadingMore = false;
}

async function fetchPage(isMore) {
  if (!isMore) dom.loading.classList.add('visible');

  const params = new URLSearchParams({ q: state.query });
  if (isMore && state.continuationToken) {
    params.set('continuation', state.continuationToken);
  }

  try {
    const r    = await fetch(`${API_URL}/api/search?` + params.toString());
    const data = await r.json();

    if (data.error) throw new Error(data.error);

    state.continuationToken = data.continuationToken ?? null;

    renderCards(data.videos ?? [], !isMore);

    if (!isMore) {
      dom.resultsMeta.textContent =
        `Results for "${state.query}"` +
        (data.videos?.length ? ` — ${data.videos.length}+ videos` : '');

      // Cache the first page so the grid restores instantly on return.
      saveStore({
        query:  state.query,
        videos: (data.videos ?? []).slice(0, RESULTS_CAP).map(slimVideo),
      });
    }

    dom.loadMoreWrap.style.display = state.continuationToken ? 'flex' : 'none';

  } catch (err) {
    toast('Error: ' + err.message.slice(0, 90));
    if (!isMore) {
      dom.resultsGrid.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>
          <p>Could not load results. Is the server running?</p>
        </div>`;
    }
  } finally {
    dom.loading.classList.remove('visible');
  }
}

// ── Render cards ──────────────────────────────────────────────────────────────
function renderCards(videos, replace) {
  const grid = dom.resultsGrid;
  if (replace) grid.innerHTML = '';

  if (!videos.length && replace) {
    grid.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <p>No results found for "<strong>${escHtml(state.query)}</strong>"</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  videos.forEach((v, i) => {
    const thumb = v.thumb || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    const meta  = [v.views, v.pubDate].filter(Boolean).join(' · ');

    const card  = document.createElement('div');
    card.className = 'video-card';
    card.style.animationDelay = `${Math.min(i % 20, 15) * 30}ms`;
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', v.title);

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img class="card-thumb"
             src="${escHtml(thumb)}"
             alt=""
             loading="lazy"
             onerror="this.style.opacity='0'">
        ${v.duration ? `<span class="card-duration">${escHtml(v.duration)}</span>` : ''}
        <div class="play-btn" aria-hidden="true">
          <div class="play-btn-circle">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="card-body">
        <p class="card-title">${escHtml(v.title)}</p>
        <p class="card-channel">${escHtml(v.channel)}</p>
        ${meta ? `<p class="card-meta">${escHtml(meta)}</p>` : ''}
      </div>`;

    card.addEventListener('click', () => openModal(v));
    frag.appendChild(card);
  });

  grid.appendChild(frag);
}

// ── Render recently-watched row ─────────────────────────────────────────────
function renderRecent(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    dom.recent.style.display = 'none';
    dom.recentGrid.innerHTML = '';
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach(v => {
    const thumb = v.thumb || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    const pct   = v.duration > 0 ? Math.min(100, (v.position / v.duration) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', v.title);

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img class="card-thumb"
             src="${escHtml(thumb)}"
             alt=""
             loading="lazy"
             onerror="this.style.opacity='0'">
        <div class="play-btn" aria-hidden="true">
          <div class="play-btn-circle">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        ${pct > 0 ? `<div class="card-progress"><span style="width:${pct.toFixed(1)}%"></span></div>` : ''}
      </div>
      <div class="card-body">
        <p class="card-title">${escHtml(v.title)}</p>
        <p class="card-channel">${escHtml(v.channel)}</p>
      </div>`;

    card.addEventListener('click', () => openModal(v, { position: v.position ?? 0 }));
    frag.appendChild(card);
  });

  dom.recentGrid.innerHTML = '';
  dom.recentGrid.appendChild(frag);
  dom.recent.style.display = '';
}

// ── Modal & Player ────────────────────────────────────────────────────────────
// `video` is a video object ({ id, title, channel, thumb, ... }).
// opts.position — seconds to resume from. opts.autoplay — false leaves it paused
// (used when restoring on boot, where browsers block autoplay-with-sound).
function openModal(video, { position = 0, autoplay = true } = {}) {
  state.currentVideo = video;
  dom.modalTitle.textContent = video.title ?? '';
  setTitle(video.title);
  dom.modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  clearOverlays();

  // Record this watch immediately so the recent row is up to date even if the
  // user never plays it; refresh the row in the background.
  upsertRecent(video, position, 0);
  saveStore({ current: { id: video.id, title: video.title ?? '', position, duration: 0, updatedAt: Date.now() } });
  renderRecent(loadStore().recent ?? []);

  if (state.ytApiReady) {
    buildPlayer(video.id, { start: position, autoplay });
  } else {
    state.pendingVideo = { video, position, autoplay };
  }
}

function buildPlayer(videoId, { start = 0, autoplay = true } = {}) {
  destroyPlayer();

  // Re-create the target div (destroyed with the previous player instance)
  const old = $('yt-player');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'yt-player';
  dom.playerWrap.prepend(div);

  state.player = new YT.Player('yt-player', {
    videoId,
    playerVars: {
      autoplay:       autoplay ? 1 : 0,
      start:          Math.max(0, Math.floor(start)),
      rel:            0,       // minimize related videos
      modestbranding: 1,       // reduce YT branding
      iv_load_policy: 3,       // disable annotations
      playsinline:    1,
      origin:         window.location.origin,
    },
    events: {
      onReady: e => {
        if (autoplay) {
          e.target.playVideo();
        } else {
          // Restored session: stay paused at `start`, prompt for a click.
          dom.overlayPause.classList.add('active');
        }
      },
      onStateChange: onPlayerStateChange,
    },
  });
}

function destroyPlayer() {
  stopPositionTimer();
  if (!state.player) return;
  persistPosition();
  try { state.player.stopVideo(); state.player.destroy(); } catch { /* ignore */ }
  state.player = null;
}

function onPlayerStateChange(event) {
  clearOverlays();

  switch (event.data) {
    case YT.PlayerState.PLAYING:
      startPositionTimer();
      break;

    case YT.PlayerState.PAUSED:
      stopPositionTimer();
      persistPosition();
      // Delay slightly so we don't flash the overlay during buffering
      setTimeout(() => {
        if (state.player?.getPlayerState() === YT.PlayerState.PAUSED) {
          dom.overlayPause.classList.add('active');
        }
      }, 400);
      break;

    case YT.PlayerState.ENDED:
      stopPositionTimer();
      markCurrentComplete();
      dom.overlayEnd.classList.add('active');
      break;
  }
}

// On completion, reset the saved position to 0 so the video doesn't resume
// stuck at the final frame next time.
function markCurrentComplete() {
  const v = state.currentVideo;
  if (!v) return;
  const store  = loadStore();
  const recent = (store.recent ?? []).map(r =>
    r.id === v.id ? { ...r, position: 0, updatedAt: Date.now() } : r);
  saveStore({ current: null, recent });
  renderRecent(recent);
}

function clearOverlays() {
  dom.overlayPause.classList.remove('active');
  dom.overlayEnd.classList.remove('active');
}

function closeModal() {
  if (document.fullscreenElement) document.exitFullscreen();
  clearOverlays();
  destroyPlayer();            // persists final position into recent history
  clearCurrent();             // explicit close → don't auto-reopen on return
  state.currentVideo = null;
  dom.modal.classList.remove('active');
  document.body.style.overflow = '';
  setTitle();
  renderRecent(loadStore().recent ?? []);
}

function resumeVideo() {
  clearOverlays();
  state.player?.playVideo();
}

function replayVideo() {
  clearOverlays();
  if (state.player) { state.player.seekTo(0); state.player.playVideo(); }
}

// ── Fullscreen ────────────────────────────────────────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    dom.playerWrap.requestFullscreen().catch(e => toast('Fullscreen unavailable: ' + e.message));
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  // Swap to exit-fullscreen icon
  dom.fsIcon.innerHTML = isFs
    ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
    : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
});

// ── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  // Header search
  dom.headerBtn.addEventListener('click', () => doSearch(dom.headerInput.value));
  dom.headerInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(e.target.value); });

  // Hero search
  dom.heroBtn.addEventListener('click', () => doSearch(dom.heroInput.value));
  dom.heroInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(e.target.value); });

  // Load more
  dom.loadMoreBtn.addEventListener('click', loadMore);

  // Modal controls
  dom.modalBackdrop.addEventListener('click', closeModal);
  dom.closeBtn.addEventListener('click', closeModal);
  dom.fsBtn.addEventListener('click', toggleFullscreen);
  dom.overlayPause.addEventListener('click', resumeVideo);
  dom.replayBtn.addEventListener('click', replayVideo);
  dom.backBtn.addEventListener('click', closeModal);

  // Logo click → home (stops auto-reopening the video, keeps recent history)
  document.querySelector('.logo')?.addEventListener('click', e => {
    e.preventDefault();
    state.query             = '';
    state.continuationToken = null;
    dom.heroInput.value     = '';
    dom.headerInput.value   = '';
    dom.resultsGrid.innerHTML = '';
    if (dom.modal.classList.contains('active')) closeModal();
    clearCurrent();
    saveStore({ query: null, videos: null });
    renderRecent(loadStore().recent ?? []);
    showHero();
  });

  // Clear recently-watched history
  dom.recentClear?.addEventListener('click', () => {
    saveStore({ recent: [], current: null });
    renderRecent([]);
  });

  // Flush playback position when the page is hidden / unloaded (covers browser
  // and computer close — more reliable than `beforeunload`).
  window.addEventListener('pagehide', persistPosition);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistPosition();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const modalOpen = dom.modal.classList.contains('active');
    const typing    = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

    if (e.key === 'Escape' && modalOpen) {
      document.fullscreenElement ? document.exitFullscreen() : closeModal();
      return;
    }

    if ((e.key === 'f' || e.key === 'F') && modalOpen && !typing) {
      toggleFullscreen();
    }
  });
}

// ── YouTube IFrame API global callback ────────────────────────────────────────
// Called automatically by the YT IFrame API script once it has loaded.
window.onYouTubeIframeAPIReady = function () {
  state.ytApiReady = true;
  if (state.pendingVideo) {
    const { video, position, autoplay } = state.pendingVideo;
    buildPlayer(video.id, { start: position, autoplay });
    state.pendingVideo = null;
  }
};

// ── Utilities ─────────────────────────────────────────────────────────────────
// Reflect the playing video in the browser tab title; reset when idle.
function setTitle(videoTitle) {
  document.title = videoTitle ? `▶ ${videoTitle} — YouTube Focus` : 'YouTube Focus';
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _toastTimer;
function toast(msg, ms = 3500) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => dom.toast.classList.remove('show'), ms);
}
