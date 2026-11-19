/**
 * OmniMath Pro — app shell service worker
 *
 * 目标：Web / PWA（安卓手机、平板浏览器）离线也能打开；第二次启动直接走缓存。
 * 策略：
 *   - 导航请求：network-first（保证更新能落地），断网时回退缓存的首页；
 *   - 静态资源：stale-while-revalidate（有缓存先返回，后台刷新）；
 *   - 只处理同源 GET，不碰 GitHub API 等跨域请求。
 *
 * 首次访问时页面把已加载的 script / stylesheet 列表 postMessage 过来缓存，
 * 否则第一次访问的哈希 chunk 不在 SW 控制内，离线刷新会缺文件。
 */

const CACHE = 'omnimath-shell-v1';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            await cache.add(new Request(url, { credentials: 'same-origin' }));
          } catch {
            // 单个文件失败不影响安装。
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('omnimath-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = data.urls.filter((u) => typeof u === 'string').slice(0, 80);
      await Promise.all(
        urls.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { credentials: 'same-origin' }));
            if (res && res.ok) await cache.put(url, res);
          } catch {
            // 离线或请求失败：跳过。
          }
        }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return (
            (await caches.match(req)) ||
            (await caches.match('/')) ||
            new Response('离线，且没有可用的缓存副本。', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const network = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
