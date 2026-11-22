'use client';

import { useEffect } from 'react';

const PAUSED_CLASS = 'animations-paused';

/**
 * 页面进入后台时给 <html> 加上 .animations-paused，用于暂停背景网格、
 * 光晕、微光等装饰性无限动画；回到前台后恢复。监听器在卸载时清理。
 */
export function useVisibilityPause(): void {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      root.classList.toggle(PAUSED_CLASS, document.visibilityState === 'hidden');
    };

    sync();
    document.addEventListener('visibilitychange', sync);

    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.classList.remove(PAUSED_CLASS);
    };
  }, []);
}
