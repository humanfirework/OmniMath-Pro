/**
 * OmniMath Pro — 快捷键状态管理
 *
 * 独立于 settingsStore，管理全局快捷键的自定义配置。
 * 持久化到 localStorage，键名 omnimath-shortcuts-v1
 *
 * 快捷键匹配逻辑（matchShortcut）在 useGlobalShortcuts hook 中实现。
 * 各组件通过 registerShortcutHandler 注册自己的处理器。
 */

import { create } from 'zustand';

export const SHORTCUTS_KEY = 'omnimath-shortcuts-v1';

/** 快捷键动作标识符 — 全局可自定义的操作 */
export type ShortcutAction =
  | 'run'           // 执行计算
  | 'toggleSidebar' // 切换侧边栏
  | 'focusMode'     // 专注模式
  | 'openSettings'  // 打开设置
  | 'openPalette'   // 命令面板
  | 'clearEditor'   // 清空编辑器
  | 'togglePreview' // 切换预览
  | 'zoomIn'        // 放大
  | 'zoomOut'       // 缩小
  | 'resetView';    // 重置视图

export interface ShortcutDef {
  /** 修饰键组合，如 'ctrl' / 'ctrl+shift' / 'alt' / ''（空字符串表示无修饰键） */
  mod: string;
  /** 主键，如 'Enter' / 'k' / 'F11' */
  key: string;
}

/** 默认快捷键配置 */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutDef> = {
  run:           { mod: '',           key: 'Enter' },
  toggleSidebar: { mod: 'ctrl',       key: 'b' },
  focusMode:     { mod: '',           key: 'F11' },
  openSettings:  { mod: 'ctrl',       key: ',' },
  openPalette:   { mod: 'ctrl+shift', key: 'p' },
  clearEditor:   { mod: 'ctrl',       key: 'l' },
  togglePreview: { mod: 'ctrl',       key: 'j' },
  zoomIn:        { mod: 'ctrl',       key: '=' },
  zoomOut:       { mod: 'ctrl',       key: '-' },
  resetView:     { mod: 'ctrl',       key: '0' },
};

interface ShortcutsState {
  shortcuts: Record<ShortcutAction, ShortcutDef>;
  setShortcut: (action: ShortcutAction, def: ShortcutDef) => void;
  resetToDefaults: () => void;
  saveToStorage: () => void;
  loadFromStorage: () => void;
}

interface PersistedShortcuts {
  shortcuts: Partial<Record<ShortcutAction, ShortcutDef>>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },

  setShortcut: (action, def) => {
    set((s) => ({
      shortcuts: { ...s.shortcuts, [action]: def },
    }));
    get().saveToStorage();
  },

  resetToDefaults: () => {
    set({ shortcuts: { ...DEFAULT_SHORTCUTS } });
    get().saveToStorage();
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const payload: PersistedShortcuts = {
          shortcuts: get().shortcuts,
        };
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 300);
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SHORTCUTS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedShortcuts;
      if (data.shortcuts && typeof data.shortcuts === 'object') {
        // 合并：仅覆盖已知 action 的有效 ShortcutDef，保留默认值作为兜底
        const merged = { ...DEFAULT_SHORTCUTS };
        for (const key of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
          const v = data.shortcuts[key];
          if (v && typeof v.mod === 'string' && typeof v.key === 'string' && v.key.length > 0) {
            merged[key] = { mod: v.mod, key: v.key };
          }
        }
        set({ shortcuts: merged });
      }
    } catch {
      // ignore parse errors
    }
  },
}));

/**
 * 判断一个键盘事件是否匹配某个快捷键定义。
 * Ctrl 和 Meta（Cmd）等效处理，适配 Mac/Windows。
 */
export function matchShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
  const mods = def.mod.split('+').filter(Boolean);
  const needCtrl = mods.includes('ctrl');
  const needShift = mods.includes('shift');
  const needAlt = mods.includes('alt');
  // ctrl 或 meta 满足 needCtrl
  const hasCtrl = e.ctrlKey || e.metaKey;
  if (needCtrl !== hasCtrl) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  return e.key.toLowerCase() === def.key.toLowerCase();
}

/**
 * 将 ShortcutDef 格式化为人类可读字符串，用于 UI 显示。
 * 如 { mod: 'ctrl+shift', key: 'p' } → "Ctrl+Shift+P"
 */
export function formatShortcut(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.mod) {
    for (const m of def.mod.split('+').filter(Boolean)) {
      parts.push(m.charAt(0).toUpperCase() + m.slice(1));
    }
  }
  // 主键大写显示（单个字母）或保持原样（F11 等）
  const k = def.key.length === 1 ? def.key.toUpperCase() : def.key;
  parts.push(k);
  return parts.join('+');
}
