'use client';

/**
 * OmniMath Pro — DOM-Measured Node Port Positions
 *
 * Replaces the fixed-constant port position calculation in pipelineEngine.ts
 * with runtime DOM measurement. Each PortLabel measures its port dot's offset
 * relative to its ancestor NodeCard, and reports it to a shared context.
 *
 * Edge rendering and snap detection read from this context so connection
 * lines stay aligned with the visual port dots even when node content
 * (long expressions, matrix tables, config UIs) causes the card to grow
 * beyond the fixed NODE_WIDTH / PORT_ROW_H estimates.
 *
 * Key format: `${nodeId}:${portId}:${'in'|'out'}`
 * Value: { x, y } — port center offset relative to node card top-left.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
  type ReactNode,
  type RefObject,
} from 'react';

export interface PortOffset {
  /** Port center X relative to node card top-left (px). */
  x: number;
  /** Port center Y relative to node card top-left (px). */
  y: number;
}

export type PortPositionsMap = Map<string, PortOffset>;

interface PortPositionsContextValue {
  positions: PortPositionsMap;
  update: (key: string, offset: PortOffset) => void;
  remove: (key: string) => void;
}

const PortPositionsContext = createContext<PortPositionsContextValue | null>(null);

/** Build the map key for a port. */
export function portKey(nodeId: string, portId: string, isOutput: boolean): string {
  return `${nodeId}:${portId}:${isOutput ? 'out' : 'in'}`;
}

/** Provider that owns the positions Map. */
export function PortPositionsProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<PortPositionsMap>(() => new Map());

  const update = useCallback((key: string, offset: PortOffset) => {
    setPositions((prev) => {
      const existing = prev.get(key);
      if (existing && existing.x === offset.x && existing.y === offset.y) {
        return prev; // no change — avoid needless re-renders
      }
      const next = new Map(prev);
      next.set(key, offset);
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setPositions((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ── Memoize context value 避免每次渲染创建新对象 ──────────────
  // 虽然 positions 变化时 value 仍会变化，但至少 update/remove
  // （稳定引用）不会导致额外的不必要渲染。
  const value = useMemo(
    () => ({ positions, update, remove }),
    [positions, update, remove],
  );

  return (
    <PortPositionsContext.Provider value={value}>
      {children}
    </PortPositionsContext.Provider>
  );
}

/** Read the port positions map (for edge rendering / snap detection). */
export function usePortPositions(): PortPositionsMap {
  const ctx = useContext(PortPositionsContext);
  return ctx?.positions ?? new Map();
}

/**
 * Hook for PortLabel: measures the port dot's center offset relative to
 * its ancestor `.node-card` element, and reports it to the context.
 *
 * Re-measures on:
 *  - mount
 *  - window resize
 *  - ResizeObserver mutations of the node card (config UI changes, etc.)
 *
 * @param nodeId     Node id
 * @param portId     Port id
 * @param isOutput   Input or output port
 * @param dotRef     Ref to the port dot div
 */
export function usePortReporter(
  nodeId: string,
  portId: string,
  isOutput: boolean,
  dotRef: RefObject<HTMLDivElement | null>,
) {
  const ctx = useContext(PortPositionsContext);
  const key = portKey(nodeId, portId, isOutput);
  // Keep latest key in a ref so the cleanup function can remove by key
  // even after nodeId/portId props change.
  const keyRef = useRef(key);
  keyRef.current = key;

  // ── 关键修复：用 ref 持有 ctx，避免 measure 依赖 ctx ──────────
  // 之前 measure 的 deps 是 [ctx, dotRef]，但 ctx 是
  // PortPositionsContext.Provider value={...} 每次渲染创建的新对象，
  // 导致 measure 重建 → useLayoutEffect 重新执行 → measure() →
  // ctx.update() → setPositions() → Provider 重新渲染 → ctx 新对象 →
  // 无限循环（Maximum update depth exceeded）。
  // 改用 ctxRef 后 measure 的 deps 仅 [dotRef]，永不重建，
  // useLayoutEffect 只在 mount 时执行一次。
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const measure = useCallback(() => {
    const dot = dotRef.current;
    if (!dot) return;
    const card = dot.closest('.node-card') as HTMLElement | null;
    if (!card) return;
    const dotRect = dot.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const x = dotRect.left + dotRect.width / 2 - cardRect.left;
    const y = dotRect.top + dotRect.height / 2 - cardRect.top;
    ctxRef.current?.update(keyRef.current, { x, y });
  }, [dotRef]);

  // Measure on mount + key change.
  useLayoutEffect(() => {
    measure();
    return () => {
      ctxRef.current?.remove(keyRef.current);
    };
  }, [measure]);

  // Re-measure when the node card resizes (config changes, long content).
  useLayoutEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;
    const card = dot.closest('.node-card') as HTMLElement | null;
    if (!card) return;
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(card);
    // Also observe the dot itself in case its size changes.
    ro.observe(dot);
    return () => ro.disconnect();
  }, [measure, dotRef]);

  // Re-measure on window resize (cardRect changes with viewport).
  useLayoutEffect(() => {
    const handler = () => measure();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [measure]);
}
