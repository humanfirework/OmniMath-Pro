'use client';

import { useCallback, useEffect, useState } from 'react';
import { Workbench } from '@/components/workbench/Workbench';
import { SplashScreen } from '@/components/workbench/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * The workbench mounts immediately. The splash is only a brand overlay on
 * top — previously the whole app waited for a ~5s video before mounting,
 * which made cold start feel much slower than it actually was.
 */
export default function Home() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    try {
      // 品牌页只在“这台设备的第一次访问”出现；之后启动直接进工作台。
      if (localStorage.getItem('omnimath-splash-seen-v2') === '1') return;
      // 深链（?view=pipeline / whiteboard …）说明用户是直奔某个工具的，
      // 不要用品牌动画再挡一次；系统开启“减少动态效果”时同样跳过。
      const params = new URLSearchParams(window.location.search);
      if (params.get('view')) return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      setShowSplash(true);
    } catch {
      setShowSplash(true);
    }
  }, []);

  const finishSplash = useCallback(() => {
    try {
      localStorage.setItem('omnimath-splash-seen-v2', '1');
    } catch {
      // ignore private-mode storage errors
    }
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
      <Workbench />
      {showSplash && <SplashScreen onFinish={finishSplash} />}
    </ErrorBoundary>
  );
}
