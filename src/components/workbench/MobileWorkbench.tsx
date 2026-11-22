'use client';

/**
 * OmniMath Pro — Mobile Workbench
 *
 * Simplified stacked layout for small screens:
 *  - Top: TitleBar (compact)
 *  - Tabs: 编辑器 / 预览 / 侧栏
 *  - Bottom: StatusBar
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2,
  Eye,
  House,
  PanelLeft,
  PencilRuler,
} from 'lucide-react';
import { TitleBar } from '@/components/workbench/layout/TitleBar';
import {
  LazyEditorPanel,
  LazyPreviewPanel,
  LazySidePanel,
} from '@/components/workbench/layout/LazyPanels';
import { useAIContextStore } from '@/lib/store/aiContextStore';
import type { ViewMode } from '@/lib/store/workbench';
import { cn } from '@/lib/utils';

type MobileTab = 'home' | 'editor' | 'preview' | 'side' | 'canvas';

const TABS: Array<{ id: MobileTab; icon: typeof Code2; label: string }> = [
  { id: 'home', icon: House, label: '首页' },
  // “侧栏”是桌面术语；手机上是历史 / 变量 / 文件 / 公式库的集合，叫“资料”更直白。
  { id: 'side', icon: PanelLeft, label: '资料' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'canvas', icon: PencilRuler, label: '白板' },
  { id: 'preview', icon: Eye, label: '预览' },
];

const WhiteboardCanvas = lazy(() =>
  import('@/components/workbench/whiteboard/WhiteboardCanvas').then((m) => ({
    default: m.WhiteboardCanvas,
  })),
);

const StudioHome = lazy(() =>
  import('@/components/workbench/studio/StudioHome').then((m) => ({
    default: m.StudioHome,
  })),
);

export function MobileWorkbench({ initialView }: { initialView?: ViewMode | null }) {
  // Phone opens on the canvas: this is a handwriting-first app, not an IDE.
  const [tab, setTab] = useState<MobileTab>('canvas');

  // PWA / 桌面快捷方式：?view=home / ?view=workbench 要落到对应标签，
  // 而不是无论请求什么都显示画布。参数在挂载后到达，所以用 effect 同步。
  useEffect(() => {
    if (!initialView) return;
    if (initialView === 'home') setTab('home');
    else if (initialView === 'workbench') setTab('editor');
  }, [initialView]);

  // AI 请求从编辑器 / 结果发起时，答案在「预览」里的 AI 标签：
  // 手机上自动切过去，避免用户以为没有反应。
  const promptSeq = useAIContextStore((s) => s.promptSeq);
  useEffect(() => {
    if (promptSeq > 0) setTab('preview');
  }, [promptSeq]);

  // 选区「画图」等动作也可以请求切到预览（桌面端没有监听者，事件无副作用）。
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (next === 'home' || next === 'editor' || next === 'preview' || next === 'side' || next === 'canvas') {
        setTab(next);
      }
    };
    window.addEventListener('omnimath:mobile-tab', handler);
    return () => window.removeEventListener('omnimath:mobile-tab', handler);
  }, []);

  return (
    <div className="h-[100dvh] w-screen max-w-full flex flex-col overflow-hidden overflow-x-hidden bg-background text-foreground">
      <TitleBar />

      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0"
          >
            {tab === 'home' && (
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    加载工具…
                  </div>
                }
              >
                <StudioHome />
              </Suspense>
            )}
            {tab === 'editor' && <LazyEditorPanel />}
            {tab === 'preview' && <LazyPreviewPanel />}
            {tab === 'side' && <LazySidePanel onClose={() => setTab('home')} />}
            {tab === 'canvas' && (
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    加载白板…
                  </div>
                }
              >
                <WhiteboardCanvas />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile tab bar：底部安全区留白，避免 iPhone 手势条压住标签；
          选中项加一条顶端指示线，比只变颜色更容易在户外看清。 */}
      <div className="shrink-0 flex items-stretch border-t border-border bg-background/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              'touch-target relative flex-1 flex flex-col items-center justify-center gap-0.5 h-12 text-[10px] transition-colors active:scale-[0.97]',
              tab === id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-full transition-opacity',
                tab === id ? 'bg-primary opacity-100' : 'opacity-0',
              )}
            />
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Status bar removed on phones: the tab bar already carries navigation,
          and the extra 24px row wrapped into the tabs on narrow screens. */}
    </div>
  );
}
