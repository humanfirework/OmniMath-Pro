'use client';

/**
 * OmniMath Pro — SplashScreen
 *
 * 启动动画：全屏播放「曼陀罗」WebM 启动 logo，播放结束后淡出并进入主工作台。
 *
 * 健壮性设计：
 *  - muted + autoPlay + playsInline：保证 WebView2 / 浏览器环境都能自动播放；
 *  - onEnded：正常播放结束 → 淡出；
 *  - 兜底定时器（MAX_MS）：若 onEnded 未触发（解码失败 / 被拦截）也强制进入，
 *    避免用户卡在启动页无法进入应用；
 *  - onError / 点击跳过：立即进入；
 *  - 视频限定在视口内（max-w / max-h），不溢出大屏。
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** 兜底：若 onEnded 未触发，最长停留时间（ms）。 */
const MAX_MS = 6000;

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [exiting, setExiting] = useState(false);
  // 用 ref 保证 finish 只执行一次（onEnded / 定时器 / 点击 / onError 并发触发）。
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
    // 等淡出动画结束后再卸载视图，避免生硬跳变。
    window.setTimeout(onFinish, 450);
  };

  // 兜底定时器：防止视频异常导致永远停留在启动页。
  useEffect(() => {
    const timer = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="splash"
          onClick={finish}
          className="fixed inset-0 z-[120] grid place-items-center bg-background cursor-pointer"
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col items-center gap-6 p-6"
          >
            <video
              src="/splash.webm"
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={finish}
              onError={finish}
              className="pointer-events-none select-none h-auto w-auto max-w-[70vw] max-h-[55vh]"
            />
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <span className="text-xs tracking-wide">OmniMath Pro</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}