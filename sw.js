/* Worship service worker. Bump V when any app file changes, and the ?v= numbers in index.html (they must match). */
const V = '3';
const CACHE = 'worship-' + V;
const FONTS = 'worship-fonts';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'core.js?v=' + V, 'css/app.css?v=' + V,
  'js/ui.js?v=' + V, 'js/demo.js?v=' + V, 'js/store.js?v=' + V, 'js/synth.js?v=' + V, 'js/edit.js?v=' + V, 'js/notation.js?v=' + V,
  'js/audio.js?v=' + V, 'js/app.js?v=' + V, 'js/sets.js?v=' + V, 'js/live.js?v=' + V, 'js/piano.js?v=' + V, 'js/transcribe.js?v=' + V,
  'js/practice.js?v=' + V, 'js/keys.js?v=' + V, 'js/pitch-worker.js', 'vendor/vexflow-bravura.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('worship-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: false }).then((r) => r || caches.match('index.html'));
    const timer = setTimeout(() => { if (!done) fromCache().then((r) => { if (r && !done) { done = true; resolve(r); } }); }, ms);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) fromCache().then((r) => { done = true; resolve(r || Response.error()); });
    });
  });
}

// Fonts: serve the saved copy, refresh it in the background.
function fontsFirst(req) {
  return caches.open(FONTS).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
    return hit || net;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(fontsFirst(req)); return; }
  if (url.origin !== location.origin) return; // Apps Script, YouTube: never cached. Audio lives in IndexedDB, not here.
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isPage) { e.respondWith(networkFirst(req.mode === 'navigate' ? new Request(new URL('index.html', self.registration.scope).href) : req, 4000)); return; }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
