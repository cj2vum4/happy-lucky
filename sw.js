'use strict';

const VERSION = '2026-08-20.1';
const CORE_CACHE = `happy-lucky-core-${VERSION}`;
const RUNTIME_CACHE = `happy-lucky-runtime-${VERSION}`;
const IMAGE_CACHE = `happy-lucky-images-${VERSION}`;
const CACHE_PREFIX = 'happy-lucky-';
const MAX_IMAGE_ENTRIES = 80;

const scopeUrl = new URL(self.registration.scope);
const assetUrl = path => new URL(path, scopeUrl).href;
const CORE_ASSETS = [
  './app.html',
  './offline.html',
  './index.html',
  './account.html',
  './manifest.json',
  './trips.json',
  './assets/mobile-enhancements.css',
  './assets/mobile-enhancements.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png'
].map(assetUrl);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CORE_CACHE).then(async cache => {
      await Promise.allSettled(CORE_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && ![CORE_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlResponse(response) {
  return response && response.ok && (response.headers.get('content-type') || '').includes('text/html');
}

async function enhanceHtml(response, requestUrl) {
  if (!isHtmlResponse(response)) return response;
  const path = new URL(requestUrl).pathname;
  if (path.endsWith('/app.html') || path.endsWith('/offline.html')) return response;

  let html = await response.text();
  if (html.includes('mobile-enhancements.js')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  const css = new URL('./assets/mobile-enhancements.css', scopeUrl).pathname + `?v=${VERSION}`;
  const js = new URL('./assets/mobile-enhancements.js', scopeUrl).pathname + `?v=${VERSION}`;
  const headTag = `<link rel="stylesheet" href="${css}" data-pwa-enhancement>`;
  const bodyTag = `<script src="${js}" defer data-pwa-enhancement></script>`;
  html = html.includes('</head>') ? html.replace('</head>', `${headTag}</head>`) : headTag + html;
  html = html.includes('</body>') ? html.replace('</body>', `${bodyTag}</body>`) : html + bodyTag;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('x-happy-lucky-pwa', VERSION);
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function networkFirst(request, { timeout = 4500, enhance = false } = {}) {
  const cache = await caches.open(RUNTIME_CACHE);
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) await cache.put(request, response.clone());
    return enhance ? enhanceHtml(response, request.url) : response;
  } catch (error) {
    clearTimeout(timer);
    const cached = await cache.match(request) || await caches.match(request, { ignoreSearch: true });
    if (cached) return enhance ? enhanceHtml(cached, request.url) : cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  const response = cached || await network;
  return response || Response.error();
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
    trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        return await networkFirst(request, { enhance: true });
      } catch {
        const offline = await caches.match(assetUrl('./offline.html'));
        return offline || Response.error();
      }
    })());
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (url.pathname.endsWith('/trips.json') || url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request, { timeout: 3500 }));
    return;
  }

  if (['style', 'script', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
