'use client';

/**
 * OmniMath Pro — Mobile Workbench
 *
 * Simplified stacked layout for small screens:
 *  - Top: TitleBar (compact)
 *  - Tabs: 编辑器 / 预览 / 侧栏
 *  - Bottom: StatusBar
 */

import { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2,
  Eye,
  PanelLeft,
  PencilRuler,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { TitleBar } from '@/components/workbench/layout/TitleBar';
import { EditorPanel } from '@/components/workbench/layout/EditorPanel';
import { PreviewPanel } from '@/components/workbench/layout/PreviewPanel';
import { SidePanel } from '@/components/workbench/layout/SidePanel';
import { StatusBar } from '@/components/workbench/layout/StatusBar';
import { cn } from '@/lib/utils';

type MobileTab = 'editor' | 'preview' | 'side' | 'canvas';

const TABS: Array<{ id: MobileTab; icon: typeof Code2; label: string }> = [
  { id: 'side', icon: PanelLeft, label: '侧栏' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'canvas', icon: PencilRuler, label: '画布' },
  { id: 'preview', icon: Eye, label: '预览' },
];

const WhiteboardCanvas = lazy(() =>
  import('@/components/workbench/whiteboard/WhiteboardCanvas').then((m) => ({
    default: m.WhiteboardCanvas,
  })),
);

export function MobileWorkbench() {
  const [tab, setTab] = useState<MobileTab>('editor');

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-background text-foreground">
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
            {tab === 'editor' && <EditorPanel />}
            {tab === 'preview' && <PreviewPanel />}
            {tab === 'side' && <SidePanel />}
            {tab === 'canvas' && (
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    加载画布…
                  </div>
                }
              >
                <WhiteboardCanvas />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile tab bar */}
      <div className="shrink-0 h-12 flex items-stretch border-t border-border bg-background/80 backdrop-blur-md">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors',
              tab === id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <StatusBar />
    </div>
  );
}
