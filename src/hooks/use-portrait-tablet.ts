'use client';

import { useEffect, useState } from 'react';

/**
 * 竖屏平板（触屏、宽度 ≤1100、高 > 宽）。
 *
 * 这类设备用左右分栏时，编辑器和预览各只剩三百多像素，预览标签还会被截断；
 * 工作台因此默认改成上下分栏：编辑器在上、预览在下。
 */
export function usePortraitTablet(): boolean {
  const [portraitTablet, setPortraitTablet] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const touch = navigator.maxTouchPoints > 0;
      setPortraitTablet(
        touch && window.innerWidth <= 1100 && window.innerHeight > window.innerWidth,
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return portraitTablet;
}
