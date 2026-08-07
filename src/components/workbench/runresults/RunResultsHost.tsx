'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useRunResultsStore } from '@/lib/store/runResultsStore';
import { RunResultView } from './RunResultView';

const MIN_W = 260;
const MIN_H = 180;

interface WinState {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/**
 * 独立运行结果面板宿主（MATLAB figure 风格浮窗）。
 * 从 runResultsStore 读取面板，每个面板渲染为一个可拖拽/缩放/多开的浮窗。
 */
export function RunResultsHost() {
  const panels = useRunResultsStore((s) => s.panels);
  const closePanel = useRunResultsStore((s) => s.closePanel);
  const clearPanels = useRunResultsStore((s) => s.clearPanels);
  const [wins, setWins] = useState<Record<string, WinState>>({});
  const [zTop, setZTop] = useState(10);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const ensureWin = useCallback((id: string, kind: string) => {
    setWins((prev) => {
      if (prev[id]) return prev;
      const size = sizeRef.current;
      const w = Math.min(420, Math.max(MIN_W, size.w * 0.5));
      const h = Math.min(320, Math.max(MIN_H, size.h * 0.4));
      const index = Object.keys(prev).length;
      const x = 20 + (index % 4) * 28;
      const y = 20 + (index % 4) * 24;
      const isAnim = kind === 'animation';
      return { ...prev, [id]: { x, y, w: isAnim ? 520 : w, h: isAnim ? 380 : h, z: 10 + index } };
    });
  }, []);

  // 面板列表变化时，为新增面板分配窗口（幂等，已在的跳过）。
  useEffect(() => {
    for (const p of panels) ensureWin(p.id, p.kind);
  }, [panels, ensureWin]);

  const bringToFront = useCallback((id: string) => {
    setZTop((z) => z + 1);
    setWins((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], z: zTop + 1 } } : prev));
  }, [zTop]);

  const startDrag = useCallback(
    (id: string, e: React.PointerEvent) => {
      bringToFront(id);
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = wins[id];
      if (!start) return;
      const onMove = (ev: PointerEvent) => {
        setWins((prev) => prev[id]
          ? { ...prev, [id]: { ...prev[id], x: start.x + ev.clientX - startX, y: start.y + ev.clientY - startY } }
          : prev);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [wins, bringToFront, zTop],
  );

  const startResize = useCallback(
    (id: string, e: React.PointerEvent) => {
      bringToFront(id);
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = wins[id];
      if (!start) return;
      const onMove = (ev: PointerEvent) => {
        setWins((prev) => prev[id]
          ? {
              ...prev,
              [id]: {
                ...prev[id],
                w: Math.max(MIN_W, start.w + ev.clientX - startX),
                h: Math.max(MIN_H, start.h + ev.clientY - startY),
              },
            }
          : prev);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [wins, bringToFront, zTop],
  );

  return (
    <div
      ref={(el) => {
        if (el) sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
      }}
      className="pointer-events-none absolute inset-0 z-30"
    >
      {panels.length > 0 && (
        <button
          onClick={clearPanels}
          className="pointer-events-auto absolute top-2 right-2 z-50 text-[11px] px-2 py-1 rounded-md bg-accent/70 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="关闭全部结果面板"
        >
          关闭全部
        </button>
      )}
      <AnimatePresence>
        {panels.map((panel) => {
          const win = wins[panel.id];
          if (!win) return null;
          return (
            <motion.div
              key={panel.id}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.16 }}
              className="pointer-events-auto absolute flex flex-col rounded-xl border border-border/70 shadow-2xl glass-strong overflow-hidden"
              style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
              onPointerDown={() => bringToFront(panel.id)}
            >
              {/* Header */}
              <div
                className="flex items-center gap-2 h-8 px-2.5 border-b border-border/60 cursor-move select-none shrink-0"
                onPointerDown={(e) => startDrag(panel.id, e)}
              >
                <span className="size-2 rounded-full bg-primary/70" />
                <span className="flex-1 truncate text-[12px] font-semibold">{panel.title}</span>
                <button
                  onClick={() => closePanel(panel.id)}
                  className="size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="关闭"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {/* Body */}
              <div className="relative flex-1 min-h-0">
                <RunResultView panel={panel} />
              </div>
              {/* Resize handle */}
              <div
                className="absolute bottom-0 right-0 size-4 cursor-se-resize z-10"
                onPointerDown={(e) => startResize(panel.id, e)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}