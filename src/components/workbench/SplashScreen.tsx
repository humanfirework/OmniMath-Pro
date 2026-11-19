'use client';

/**
 * OmniMath Pro — SplashScreen
 *
 * 首启品牌页：只显示一次（localStorage 记忆），用 572B 的 icon.svg
 * 代替原先 1.27MB 的启动视频，避免品牌动画和应用代码抢带宽。
 *
 *  - 兜底定时器（MAX_MS）：即使动画/字体异常也按时进入；
 *  - 点击任意位置立即进入；
 *  - 深链与“减少动态效果”会在 page.tsx 直接跳过，不出现这一层。
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** 兜底：品牌页最长停留时间（ms）。主工作台已在背后加载。 */
const MAX_MS = 700;

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [exiting, setExiting] = useState(false);
  // 用 ref 保证 finish 只执行一次（定时器 / 点击并发触发）。
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setExiting(true);
    // 等淡出动画结束后再卸载视图，避免生硬跳变。
    window.setTimeout(onFinish, 200);
  };

  // 兜底定时器：防止异常导致永远停留在启动页。
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
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex flex-col items-center gap-5 p-6"
          >
            <img
              src="/icon.svg"
              alt=""
              className="size-20 rounded-2xl shadow-lg shadow-primary/10"
              draggable={false}
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