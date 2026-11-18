'use client';

import { useEffect, useState } from 'react';

/**
 * 是否是「笔优先」的触屏设备（平板 / 手机 / 触屏小笔记本）。
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia?.('(pointer: coarse)');
    const update = () => {
      const touch = navigator.maxTouchPoints > 0 && window.innerWidth <= 1280;
      setCoarse(Boolean(mq?.matches) || touch);
    };
    update();
    mq?.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return coarse;
}
