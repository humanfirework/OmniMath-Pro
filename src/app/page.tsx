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
      if (sessionStorage.getItem('omnimath-splash-seen') !== '1') setShowSplash(true);
    } catch {
      setShowSplash(true);
    }
  }, []);

  const finishSplash = useCallback(() => {
    try {
      sessionStorage.setItem('omnimath-splash-seen', '1');
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
