import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS_KEY,
  matchShortcut,
  useShortcutsStore,
} from './shortcutsStore';

/**
 * 回归测试：运行快捷键曾经是「裸 Enter」。
 * 那会让用户在编辑器里想换行时把整个脚本跑一遍，是「编辑器不好用」的根源之一。
 * 现在 Enter 用于换行，运行改为 Ctrl/Cmd+Enter。
 */
describe('shortcutsStore — run shortcut', () => {
  beforeEach(() => {
    localStorage.clear();
    useShortcutsStore.getState().resetToDefaults();
  });

  it('run 默认是 Ctrl+Enter（Enter 留给编辑器换行）', () => {
    expect(DEFAULT_SHORTCUTS.run).toEqual({ mod: 'ctrl', key: 'Enter' });
  });

  it('matchShortcut 只把 Ctrl/Cmd+Enter 当作运行，裸 Enter 不匹配', () => {
    const def = DEFAULT_SHORTCUTS.run;
    expect(matchShortcut(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }), def)).toBe(true);
    expect(matchShortcut(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }), def)).toBe(true);
    expect(matchShortcut(new KeyboardEvent('keydown', { key: 'Enter' }), def)).toBe(false);
  });

  it('旧版本持久化的裸 Enter 会迁移到 Ctrl+Enter', () => {
    localStorage.setItem(
      SHORTCUTS_KEY,
      JSON.stringify({ shortcuts: { run: { mod: '', key: 'Enter' } } }),
    );
    useShortcutsStore.getState().loadFromStorage();
    expect(useShortcutsStore.getState().shortcuts.run).toEqual({ mod: 'ctrl', key: 'Enter' });
  });

  it('用户自定义的非默认运行快捷键原样保留', () => {
    localStorage.setItem(
      SHORTCUTS_KEY,
      JSON.stringify({ shortcuts: { run: { mod: 'alt', key: 'r' } } }),
    );
    useShortcutsStore.getState().loadFromStorage();
    expect(useShortcutsStore.getState().shortcuts.run).toEqual({ mod: 'alt', key: 'r' });
  });
});
