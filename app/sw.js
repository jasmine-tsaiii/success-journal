// 成功日記 Service Worker：預先快取 App 外殼，離線也能開啟。
// 更新網站檔案後，請把 VERSION 加一，讓使用者取得新版。

const VERSION = 'v9';
const CACHE = `success-journal-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/core.js',
  './js/chakras.js',
  './js/storage.js',
  './js/board-core.js',
  './js/board-render.js',
  './js/board-ui.js',
  './js/images.js',
  './js/stickers.js',
  './js/share.js',
  './js/config.js',
  './js/cloud.js',
  './js/sync.js',
  './js/sync-core.js',
  './fonts/noto-serif-tc-500.woff2',
  './fonts/noto-serif-tc-700.woff2',
  './fonts/cormorant-500.woff2',
  './fonts/cormorant-500-italic.woff2',
  './manifest.webmanifest',
  './icons/app-favicon-64.png',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png',
  './icons/app-icon-maskable-512.png',
  './icons/app-apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('success-journal-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 頁面導覽：先試網路取得最新版，離線時改用快取（只有首頁會更新首頁的快取）
  if (request.mode === 'navigate') {
    const scope = new URL(self.registration.scope).pathname;
    const isIndex = url.pathname === scope || url.pathname === `${scope}index.html`;
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && isIndex) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => (isIndex ? caches.match('./index.html', { ignoreSearch: true }) : caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))),
    );
    return;
  }

  // 其他靜態檔：先用快取，同時在背景更新
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
