// 设置面板状态管理
// - 管理 SettingsPanel 的打开/关闭
// - 管理全局默认设置（导出 DPI、公式字号等不归 workbench/layoutStore 管的项）
// 持久化到 localStorage，键名 omnimath-settings-v1

import { create } from 'zustand';

interface SettingsState {
  /** 设置面板是否打开 */
  open: boolean;

  /* 全局默认设置 */
  /** 默认导出 DPI 倍数（1/2/4），默认 2 */
  defaultExportDpi: 1 | 2 | 4;
  /** 默认公式导出字号（px），默认 28 */
  defaultFormulaFontSize: number;
  /** 是否启用 KaTeX 数学字体（默认 true，关闭则使用系统字体） */
  useMathFont: boolean;

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  setDefaultExportDpi: (dpi: 1 | 2 | 4) => void;
  setDefaultFormulaFontSize: (size: number) => void;
  setUseMathFont: (v: boolean) => void;

  saveToStorage: () => void;
  loadFromStorage: () => void;
  resetToDefaults: () => void;
}

export const SETTINGS_KEY = 'omnimath-settings-v1';

interface PersistedSettings {
  defaultExportDpi: 1 | 2 | 4;
  defaultFormulaFontSize: number;
  useMathFont: boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  defaultExportDpi: 2,
  defaultFormulaFontSize: 28,
  useMathFont: true,

  setOpen: (v) => set({ open: v }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setDefaultExportDpi: (dpi) => {
    set({ defaultExportDpi: dpi });
    get().saveToStorage();
  },
  setDefaultFormulaFontSize: (size) => {
    set({ defaultFormulaFontSize: Math.max(12, Math.min(72, Math.round(size))) });
    get().saveToStorage();
  },
  setUseMathFont: (v) => {
    set({ useMathFont: v });
    get().saveToStorage();
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const s = get();
        const payload: PersistedSettings = {
          defaultExportDpi: s.defaultExportDpi,
          defaultFormulaFontSize: s.defaultFormulaFontSize,
          useMathFont: s.useMathFont,
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 300);
  },
  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<PersistedSettings>;
      if (data.defaultExportDpi === 1 || data.defaultExportDpi === 2 || data.defaultExportDpi === 4) {
        set({ defaultExportDpi: data.defaultExportDpi });
      }
      if (typeof data.defaultFormulaFontSize === 'number' && data.defaultFormulaFontSize > 0) {
        set({ defaultFormulaFontSize: data.defaultFormulaFontSize });
      }
      if (typeof data.useMathFont === 'boolean') {
        set({ useMathFont: data.useMathFont });
      }
    } catch {
      // ignore parse errors
    }
  },
  resetToDefaults: () => {
    set({
      defaultExportDpi: 2,
      defaultFormulaFontSize: 28,
      useMathFont: true,
    });
    get().saveToStorage();
  },
}));
