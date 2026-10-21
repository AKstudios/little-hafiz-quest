/*
 * Little Hafiz Quest: service worker (offline support)
 * ====================================================
 * - On install, stores the app itself (page, styles, scripts, data, fonts, icons) so it opens without internet.
 * - Recitation files (audio/*.mp3, one per sūrah) are stored the first time they play,
 *   or all at once from the Grown-up Corner ("Save all recitations").
 * - Audio players ask for byte ranges (to jump to an āyah). Safari requires a proper "206 Partial Content"
 *   answer, so ranges are cut from the stored file here.
 * - Only this site's own files are handled; nothing else is requested or stored.
 *
 * When you change any app file, bump VERSION so installed copies update on their next visit.
 */
'use strict';

const VERSION = '1.2.0';
const SHELL_CACHE = `lhq-shell-${VERSION}`;
const AUDIO_CACHE = 'lhq-audio-v1'; // keep across app updates; change only if the audio files change

const SHELL_FILES = [
  './',
  './index.html',
  './css/game.css',
  './js/data.js',
  './js/game.js',
  './manifest.webmanifest',
  './fonts/amiri-quran.woff2',
  './fonts/baloo-2-latin.woff2',
  './fonts/baloo-2-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('lhq-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other sites

  if (/\/audio\/\d{3}\.mp3$/.test(url.pathname)) {
    event.respondWith(audioResponse(event, url));
    return;
  }

  if (req.mode === 'navigate') {
    // The app is a single page. Answer page loads from the stored copy so the page, styles and scripts
    // always come from the same version; a new version arrives when sw.js changes (see VERSION).
    event.respondWith(cachedIndex().then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

function cachedIndex() {
  return caches.open(SHELL_CACHE).then((cache) => cache.match('./index.html'));
}

/* Serve a recitation file: from the store if saved (cutting byte ranges), otherwise from the network. */
async function audioResponse(event, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(AUDIO_CACHE);
  const stored = await cache.match(key);
  const range = event.request.headers.get('range');

  if (!stored) {
    // Play straight from the network. When the audio player asked (it always sends a Range header),
    // also store a full copy in the background for next time. Plain requests come from
    // "Save all recitations", which stores the file itself.
    if (range) {
      event.waitUntil(
        fetch(key, { cache: 'no-cache' })
          .then((res) => (res.ok && res.status === 200 ? cache.put(key, res) : undefined))
          .catch(() => {}),
      );
    }
    return fetch(event.request);
  }
  if (!range) return stored;

  const buf = await stored.arrayBuffer();
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  let start, end;
  if (m[1] === '') {
    // "bytes=-N" means the last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
