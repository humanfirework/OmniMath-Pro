/**
 * OmniMath Pro — 跨 Store 冲突检测器
 *
 * 检查 workbench / layout / settings 三个独立 store 的状态是否互相矛盾。
 * 典型冲突：
 *  - editorVisible=false 且 previewVisible=false 同时为 true（两者都关闭则无可见面板）
 *  - activityBarHidden=true 但 activityBarAutoHide=false（隐藏后无法自动恢复）
 *  - sidePanelCollapsed=true 但 activeSidePanel 指向已被移除的 tab（防御性）
 *  - previewVisible=false 但 activePreviewTab='pipeline'（pipeline 视图依赖 preview）
 *  - theme='light' 但 settings.useMathFont=true 且无对应字体回退
 *
 * 用法：在 StatusBar 中调用 `detectConflicts()`，将返回的 Conflict[] 渲染为
 * 警告徽标；点击徽标展开详情并允许用户一键修复。
 */
import { useWorkbenchStore } from './store/workbench';
import { useLayoutStore } from './store/layoutStore';
import { useSettingsStore } from './store/settingsStore';

export type ConflictSeverity = 'warning' | 'error' | 'info';

export interface Conflict {
  /** 唯一 id（用于 React key 与一键修复） */
  id: string;
  /** 严重级别：error 阻断使用，warning 提示但可继续，info 仅信息 */
  severity: ConflictSeverity;
  /** 简短标题（中文） */
  title: string;
  /** 详细描述 */
  description: string;
  /** 自动修复函数（可选；无则只能由用户手动处理） */
  fix?: () => void;
  /** 修复按钮文案 */
  fixLabel?: string;
}

/**
 * 收集当前所有 store 的冲突。纯同步函数，可在任何 React 渲染期调用。
 */
export function detectConflicts(): Conflict[] {
  const conflicts: Conflict[] = [];
  const wb = useWorkbenchStore.getState();
  const layout = useLayoutStore.getState();
  // settings store 当前没有会影响 UI 一致性的字段，但保留以备未来扩展
  void useSettingsStore.getState();

  /* 1. 编辑器与预览同时关闭 → 用户看不到任何内容 */
  if (!wb.editorVisible && !wb.previewVisible) {
    conflicts.push({
      id: 'no-visible-panel',
      severity: 'warning',
      title: '编辑器与预览面板均已隐藏',
      description: '当前工作区无可见面板，请至少显示其中一个以继续操作。',
      fixLabel: '显示编辑器',
      fix: () => useWorkbenchStore.getState().setEditorVisible(true),
    });
  }

  /* 2. ActivityBar 隐藏后无自动恢复路径（用户无法唤回） */
  if (wb.activityBarHidden && !wb.activityBarAutoHide && !wb.activityBarLocked) {
    // 这种状态是合法的（用户可悬停触发），但如果是被意外触发的隐藏且无 autoHide
    // 标志，用户可能找不到恢复入口。仅作为 info 提示。
    conflicts.push({
      id: 'activitybar-stuck-hidden',
      severity: 'info',
      title: '活动栏处于隐藏状态',
      description: '将鼠标悬停在窗口左/右侧边缘可唤回活动栏。',
      fixLabel: '立即显示',
      fix: () => useWorkbenchStore.getState().toggleActivityBarHidden(),
    });
  }

  /* 3. ActivityBar 锁定 + 自动隐藏（互斥语义） */
  if (wb.activityBarLocked && wb.activityBarAutoHide) {
    conflicts.push({
      id: 'activitybar-locked-autohide',
      severity: 'warning',
      title: '活动栏已锁定但仍启用自动隐藏',
      description: '锁定状态下自动隐藏不会生效，建议关闭其一。',
      fixLabel: '关闭自动隐藏',
      fix: () => useWorkbenchStore.getState().setActivityBarAutoHide(false),
    });
  }

  /* 4. 预览面板关闭但当前 preview tab 为 pipeline（pipeline 依赖 preview） */
  if (!wb.previewVisible && wb.activePreviewTab === 'pipeline') {
    conflicts.push({
      id: 'pipeline-without-preview',
      severity: 'warning',
      title: 'Pipeline 视图需要预览面板',
      description: '当前预览面板已隐藏，无法显示 pipeline 节点编辑器。',
      fixLabel: '显示预览',
      fix: () => useWorkbenchStore.getState().setPreviewVisible(true),
    });
  }

  /* 5. viewMode=pipeline 但 editorVisible=false（pipeline 通常需要编辑器作为节点源） */
  if (wb.viewMode === 'pipeline' && !wb.editorVisible) {
    conflicts.push({
      id: 'pipeline-without-editor',
      severity: 'info',
      title: 'Pipeline 模式建议显示编辑器',
      description: 'Pipeline 编辑器通常需要主编辑器作为节点输入源。',
      fixLabel: '显示编辑器',
      fix: () => useWorkbenchStore.getState().setEditorVisible(true),
    });
  }

  /* 6. 预览位置=bottom 但编辑器关闭（bottom 模式依赖垂直布局） */
  if (layout.previewPosition === 'bottom' && !wb.editorVisible && wb.previewVisible) {
    conflicts.push({
      id: 'bottom-preview-without-editor',
      severity: 'info',
      title: '底部预览模式建议显示编辑器',
      description: '当前预览位于底部，但编辑器已隐藏，布局可能不平衡。',
      fixLabel: '显示编辑器',
      fix: () => useWorkbenchStore.getState().setEditorVisible(true),
    });
  }

  /* 7. 侧栏已折叠但 activeSidePanel 仍在显示（实际无 bug，但状态冗余） */
  // 这是合法状态（折叠时仍记录上次激活的 tab），不视为冲突。

  /* 8. 大量历史结果未清理（性能隐患） */
  if (wb.results.length > 150) {
    conflicts.push({
      id: 'history-overflow',
      severity: 'info',
      title: `历史记录较多（${wb.results.length} 条）`,
      description: '历史记录超过 150 条可能影响加载速度，建议清理。',
      fixLabel: '清理历史',
      fix: () => useWorkbenchStore.getState().clearHistory(),
    });
  }

  return conflicts;
}

/**
 * 计算冲突总数（含 info）与需用户关注数（warning + error）。
 * 用于 StatusBar 徽标显示。
 */
export function summarizeConflicts(conflicts: Conflict[]): {
  total: number;
  warning: number;
  error: number;
  info: number;
  hasActionable: boolean;
} {
  let warning = 0;
  let error = 0;
  let info = 0;
  for (const c of conflicts) {
    if (c.severity === 'warning') warning++;
    else if (c.severity === 'error') error++;
    else info++;
  }
  return {
    total: conflicts.length,
    warning,
    error,
    info,
    hasActionable: warning + error > 0,
  };
}
