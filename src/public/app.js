/* ══════════════════════════════════════════════════════════════════
   YouTube Focus — Frontend
   All API calls go to the local Node.js server (/api/search).
   The server proxies to YouTube's Innertube API, bypassing CORS.
   ══════════════════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  query:             '',
  continuationToken: null,
  loadingMore:       false,
  serverOnline:      false,
  player:            null,   // YT.Player instance
  ytApiReady:        false,
  pendingVideo:      null,   // { id, title } buffered while API loads
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
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
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  checkServer();
  showHero();
});

// ── Server health check ───────────────────────────────────────────────────────
async function checkServer() {
  setStatus('checking');
  try {
    const r = await fetch('/api/search?q=test', { signal: AbortSignal.timeout(5000) });
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
  dom.results.classList.remove('visible');
  dom.loading.classList.remove('visible');
  dom.loadMoreWrap.style.display = 'none';
}

function showResults() {
  dom.hero.classList.remove('visible');
  dom.results.classList.add('visible');
}

// ── Search ────────────────────────────────────────────────────────────────────
async function doSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query) return;
  if (!state.serverOnline) { toast('Server offline — make sure node server.js is running'); return; }

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
    const r    = await fetch('/api/search?' + params.toString());
    const data = await r.json();

    if (data.error) throw new Error(data.error);

    state.continuationToken = data.continuationToken ?? null;

    renderCards(data.videos ?? [], !isMore);

    if (!isMore) {
      dom.resultsMeta.textContent =
        `Results for "${state.query}"` +
        (data.videos?.length ? ` — ${data.videos.length}+ videos` : '');
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

    card.addEventListener('click', () => openModal(v.id, v.title));
    frag.appendChild(card);
  });

  grid.appendChild(frag);
}

// ── Modal & Player ────────────────────────────────────────────────────────────
function openModal(videoId, title) {
  dom.modalTitle.textContent = title;
  dom.modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  clearOverlays();

  if (state.ytApiReady) {
    buildPlayer(videoId);
  } else {
    state.pendingVideo = { id: videoId, title };
  }
}

function buildPlayer(videoId) {
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
      autoplay:       1,
      rel:            0,       // minimize related videos
      modestbranding: 1,       // reduce YT branding
      iv_load_policy: 3,       // disable annotations
      playsinline:    1,
      origin:         window.location.origin,
    },
    events: {
      onReady:       e  => e.target.playVideo(),
      onStateChange: onPlayerStateChange,
    },
  });
}

function destroyPlayer() {
  if (!state.player) return;
  try { state.player.stopVideo(); state.player.destroy(); } catch { /* ignore */ }
  state.player = null;
}

function onPlayerStateChange(event) {
  clearOverlays();

  switch (event.data) {
    case YT.PlayerState.PAUSED:
      // Delay slightly so we don't flash the overlay during buffering
      setTimeout(() => {
        if (state.player?.getPlayerState() === YT.PlayerState.PAUSED) {
          dom.overlayPause.classList.add('active');
        }
      }, 400);
      break;

    case YT.PlayerState.ENDED:
      dom.overlayEnd.classList.add('active');
      break;
  }
}

function clearOverlays() {
  dom.overlayPause.classList.remove('active');
  dom.overlayEnd.classList.remove('active');
}

function closeModal() {
  if (document.fullscreenElement) document.exitFullscreen();
  clearOverlays();
  destroyPlayer();
  dom.modal.classList.remove('active');
  document.body.style.overflow = '';
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

  // Logo click → home
  document.querySelector('.logo')?.addEventListener('click', e => {
    e.preventDefault();
    state.query             = '';
    state.continuationToken = null;
    dom.heroInput.value     = '';
    dom.headerInput.value   = '';
    dom.resultsGrid.innerHTML = '';
    showHero();
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
    buildPlayer(state.pendingVideo.id);
    state.pendingVideo = null;
  }
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _toastTimer;
function toast(msg, ms = 3500) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => dom.toast.classList.remove('show'), ms);
}
