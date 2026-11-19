/**
 * 注册 app shell service worker（仅生产环境的 Web 端）。
 *
 * - 开发模式跳过：避免 HMR 读到缓存里的旧 chunk；
 * - Tauri / file 协议跳过：桌面与安卓原生壳本身就是本地资源；
 * - 注册完成后把当前页面实际加载的 script / stylesheet 交给 SW 缓存，
 *   让第一次访问的哈希 chunk 也能离线使用。
 */

import { inTauri } from '@/lib/tauri';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
  if (inTauri()) return;

  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker
        .register('/sw.js')
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          const urls = new Set<string>();
          document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((el) => {
            if (el.src) urls.add(el.src);
          });
          document
            .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href], link[rel="icon"][href], link[rel="apple-touch-icon"][href]')
            .forEach((el) => {
              if (el.href) urls.add(el.href);
            });
          // Next 的 async / preload 脚本不一定以 script[src] 形式存在，
          // 用 Resource Timing 兜底，把本次实际加载过的同源静态资源都交给 SW。
          try {
            for (const entry of performance.getEntriesByType('resource')) {
              const href = (entry as PerformanceResourceTiming).name;
              if (!href || !href.startsWith(window.location.origin)) continue;
              if (/\.(?:js|css|woff2?|png|svg|webmanifest)(?:\?|$)/.test(href)) urls.add(href);
            }
          } catch {
            // 老 WebView 没有 Resource Timing：忽略。
          }
          if (registration.active) {
            registration.active.postMessage({ type: 'CACHE_URLS', urls: [...urls] });
          }
        })
        .catch(() => {
          // 注册失败（权限 / 非安全上下文）：不影响正常在线使用。
        });
    },
    { once: true },
  );
}
