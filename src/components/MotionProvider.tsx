'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

/**
 * 让所有 framer-motion 动画尊重系统“减少动态效果”偏好：
 * reducedMotion="user" 会在开启时跳过位移/缩放动画，仅保留透明度变化。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
