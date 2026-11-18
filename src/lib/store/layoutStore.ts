// 布局状态管理 — 独立于 workbench store，避免主 store 膨胀
// 管理：预览面板位置（右侧 / 下方）、简单模式预览尺寸
// 持久化到 localStorage，键名 omnimath-layout-v1

import { create } from 'zustand';

export type PreviewPosition = 'right' | 'bottom';
export type PreviewSize = 'compact' | 'large';

interface LayoutState {
  /** 预览面板相对编辑器的位置 */
  previewPosition: PreviewPosition;
  /** 简单模式公式预览尺寸（影响 min-height） */
  previewSize: PreviewSize;

  setPreviewPosition: (p: PreviewPosition) => void;
  setPreviewSize: (s: PreviewSize) => void;
  togglePreviewPosition: () => void;

  saveToStorage: () => void;
  loadFromStorage: () => void;
  resetToDefaults: () => void;
}

export const LAYOUT_KEY = 'omnimath-layout-v1';

interface PersistedLayout {
  previewPosition: PreviewPosition;
  previewSize: PreviewSize;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  previewPosition: 'right',
  previewSize: 'compact',

  setPreviewPosition: (p) => {
    set({ previewPosition: p });
    get().saveToStorage();
  },
  setPreviewSize: (s) => {
    set({ previewSize: s });
    get().saveToStorage();
  },
  togglePreviewPosition: () => {
    set((s) => ({ previewPosition: s.previewPosition === 'right' ? 'bottom' : 'right' }));
    get().saveToStorage();
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const s = get();
        const payload: PersistedLayout = {
          previewPosition: s.previewPosition,
          previewSize: s.previewSize,
        };
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 300);
  },
  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<PersistedLayout>;
      if (data.previewPosition === 'right' || data.previewPosition === 'bottom') {
        set({ previewPosition: data.previewPosition });
      }
      if (data.previewSize === 'compact' || data.previewSize === 'large') {
        set({ previewSize: data.previewSize });
      }
    } catch {
      // ignore parse errors
    }
  },
  resetToDefaults: () => {
    set({
      previewPosition: 'right',
      previewSize: 'compact',
    });
    // react-resizable-panels 把拖拽后的尺寸存在 `react-resizable-panels:<id>`。
    // 仅重置 layoutStore 不会清掉这些尺寸，面板会继续停留在被拖坏的比例上。
    if (typeof window !== 'undefined') {
      try {
        const stale: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('react-resizable-panels:')) stale.push(key);
        }
        for (const key of stale) localStorage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    }
    get().saveToStorage();
  },
}));
