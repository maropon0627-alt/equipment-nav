/* 設備保全ナビ — service-worker.js
   - アプリ本体（HTML/CSS/JS/アイコン）: 事前キャッシュ＋バックグラウンド更新
   - equipment.json / repairs.json: 通信できれば最新、できなければ前回分（オフライン閲覧）
   - 図面・写真・報告書（PDF/画像。ルート配置前提）: 一度開いたものを端末に保存（同名ファイルは更新しない運用。改訂は新ファイル名で追加）
   アプリ本体を変更したら VERSION を上げること（古いキャッシュが破棄される）。 */

const VERSION = 'v2';
const SHELL_CACHE = `navi-shell-${VERSION}`;
const DATA_CACHE = `navi-data-${VERSION}`;
const FILE_CACHE = `navi-files-${VERSION}`;
const KEEP = [SHELL_CACHE, DATA_CACHE, FILE_CACHE];

const SHELL_ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // Range要求（動画等）はそのまま通す

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (/\/(equipment|repairs)\.json$/.test(path)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
  } else if (/\.(pdf|svg|jpe?g|png|webp)$/i.test(path) && !/\/(icon-[^/]*|apple-touch-icon)\.png$/.test(path)) {
    event.respondWith(cacheFirst(req, FILE_CACHE));
  } else if (req.mode === 'navigate') {
    event.respondWith(navigation(req));
  } else {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});

async function put(cacheName, req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    const cache = await caches.open(cacheName);
    await cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    return await put(cacheName, req, res);
  } catch (err) {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  return put(cacheName, req, res);
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => put(cacheName, req, res)).catch(() => null);
  return cached || (await network) || Response.error();
}

async function navigation(req) {
  try {
    const res = await fetch(req);
    await put(SHELL_CACHE, 'index.html', res);
    return res;
  } catch (err) {
    return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
  }
}
