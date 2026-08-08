'use client';

import { useState } from 'react';
import { Workbench } from '@/components/workbench/Workbench';
import { SplashScreen } from '@/components/workbench/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Home() {
  // 启动顺序：先播放下方 SplashScreen 的启动动画，结束后再挂载主工作台。
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
      {splashDone && (
        <ErrorBoundary>
          <Workbench />
        </ErrorBoundary>
      )}
    </>
  );
}