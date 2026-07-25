/**
 * OmniMath Pro — 全局快捷键 hook
 *
 * 在 Workbench 顶层挂载一次，监听全局 keydown 事件，
 * 将按键与 shortcutsStore 中的配置匹配，分发到已注册的处理器。
 *
 * 各组件通过 registerShortcutHandler 注册自己的处理器：
 *
 *   useEffect(() => {
 *     return registerShortcutHandler('focusMode', () => {
 *       setViewMode(viewMode !== 'focus' ? 'focus' : 'workbench');
 *     });
 *   }, [viewMode, setViewMode]);
 *
 * 注意：编辑器内部行为（CodeMirror keymap 的 Enter/Tab/Shift+Enter）
 * 不走此机制，它们是编辑器内部行为而非全局快捷键。
 */

import { useEffect } from 'react';
import {
  useShortcutsStore,
  matchShortcut,
  type ShortcutAction,
} from '@/lib/store/shortcutsStore';

/** 处理器注册表（模块级单例） */
const handlers = new Map<ShortcutAction, () => void>();

/**
 * 注册一个快捷键处理器。返回取消注册的函数。
 * 在 useEffect 中调用以确保组件卸载时清理。
 */
export function registerShortcutHandler(
  action: ShortcutAction,
  handler: () => void,
): () => void {
  handlers.set(action, handler);
  return () => {
    // 仅当当前注册的 handler 仍是自己时才删除（避免被新 handler 覆盖后误删）
    if (handlers.get(action) === handler) {
      handlers.delete(action);
    }
  };
}

/**
 * 顶层 hook：在 Workbench 挂载一次。
 * 监听全局 keydown，匹配快捷键配置并调用已注册的处理器。
 */
export function useGlobalShortcuts() {
  const shortcuts = useShortcutsStore((s) => s.shortcuts);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const [actionStr, def] of Object.entries(shortcuts)) {
        const action = actionStr as ShortcutAction;
        if (!matchShortcut(e, def)) continue;

        // 在输入框内时，仅允许特定动作（如 run=Enter）触发
        // 其他动作（如 Ctrl+B 切换侧边栏）仍可触发，因为它们带修饰键
        if (inInput && !(action === 'run' || def.mod)) continue;

        const handler = handlers.get(action);
        if (handler) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
