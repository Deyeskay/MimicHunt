/*=====================================================================
  sw.js — Service worker for the Hide & Hunt PWA.
  ---------------------------------------------------------------
  NETWORK-FIRST on purpose. This project has no build step and the
  developer hard-refreshes (Ctrl+Shift+R) after every edit, so a
  cache-first worker would serve stale source. Network-first always
  fetches fresh files when online and only falls back to the cache
  when offline / on a flaky connection — so the game (and its CDN
  deps) become installable + offline-capable without breaking the
  edit→reload loop. (Hard-refresh also bypasses the SW entirely.)
=====================================================================*/
const CACHE = 'hidehunt-v1';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
    self.skipWaiting();   // activate the new worker immediately
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;   // never cache POST/peer signalling

    e.respondWith(
        fetch(req)
            .then((res) => {
                // Stash a copy of good responses (same-origin + CDN) for offline use.
                if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() =>
                caches.match(req).then((hit) =>
                    hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
                )
            )
    );
});
