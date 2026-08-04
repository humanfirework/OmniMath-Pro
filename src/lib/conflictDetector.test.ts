/**
 * Unit tests for src/lib/conflictDetector.ts
 *
 * 通过直接操作 zustand store 的状态来验证冲突检测逻辑。
 * 注意：需要在每次测试前重置 store 到已知状态。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { detectConflicts, summarizeConflicts } from './conflictDetector';
import { useWorkbenchStore } from './store/workbench';
import { useLayoutStore } from './store/layoutStore';

/* 工具：重置 workbench store 到干净状态 */
function resetWorkbenchStore(overrides: Partial<ReturnType<typeof useWorkbenchStore.getState>> = {}) {
  useWorkbenchStore.setState({
    editorVisible: true,
    previewVisible: true,
    viewMode: 'workbench' as const,
    activePreviewTab: 'formula' as const,
    activityBarHidden: false,
    activityBarLocked: false,
    activityBarAutoHide: false,
    results: [],
    ...overrides,
  });
}

function resetLayoutStore(overrides: Partial<ReturnType<typeof useLayoutStore.getState>> = {}) {
  useLayoutStore.setState({
    previewPosition: 'right' as const,
    previewSize: 'compact' as const,
    ...overrides,
  });
}

beforeEach(() => {
  resetWorkbenchStore();
  resetLayoutStore();
});

/* ----------------------------- detectConflicts ----------------------------- */

describe('detectConflicts', () => {
  it('returns empty array for clean state', () => {
    expect(detectConflicts()).toEqual([]);
  });

  it('detects when both editor and preview are hidden', () => {
    resetWorkbenchStore({ editorVisible: false, previewVisible: false });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'no-visible-panel');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('warning');
    expect(target?.fix).toBeDefined();
  });

  it('provides fix function for no-visible-panel conflict', () => {
    resetWorkbenchStore({ editorVisible: false, previewVisible: false });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'no-visible-panel');
    target?.fix?.();
    // 修复后应该显示编辑器
    expect(useWorkbenchStore.getState().editorVisible).toBe(true);
  });

  it('detects activitybar locked + autohide conflict', () => {
    resetWorkbenchStore({ activityBarLocked: true, activityBarAutoHide: true });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'activitybar-locked-autohide');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('warning');
  });

  it('provides fix for activitybar-locked-autohide (disables autohide)', () => {
    resetWorkbenchStore({ activityBarLocked: true, activityBarAutoHide: true });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'activitybar-locked-autohide');
    target?.fix?.();
    expect(useWorkbenchStore.getState().activityBarAutoHide).toBe(false);
  });

  it('detects pipeline preview tab without preview visible', () => {
    resetWorkbenchStore({
      previewVisible: false,
      activePreviewTab: 'pipeline' as const,
    });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'pipeline-without-preview');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('warning');
  });

  it('detects pipeline viewmode without editor', () => {
    resetWorkbenchStore({
      viewMode: 'pipeline' as const,
      editorVisible: false,
    });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'pipeline-without-editor');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('info');
  });

  it('detects bottom preview without editor', () => {
    resetWorkbenchStore({ editorVisible: false, previewVisible: true });
    resetLayoutStore({ previewPosition: 'bottom' as const });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'bottom-preview-without-editor');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('info');
  });

  it('detects history overflow (>150 results)', () => {
    const fakeResults = Array.from({ length: 160 }, (_, i) => ({
      id: `r-${i}`,
      input: `test ${i}`,
      output: `${i}`,
      latex: `${i}`,
      timestamp: Date.now(),
      type: 'number',
    }));
    resetWorkbenchStore({ results: fakeResults as never });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'history-overflow');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('info');
    expect(target?.title).toContain('160');
  });

  it('does not flag history overflow with <150 results', () => {
    const fakeResults = Array.from({ length: 100 }, (_, i) => ({
      id: `r-${i}`,
      input: `test ${i}`,
      output: `${i}`,
      latex: `${i}`,
      timestamp: Date.now(),
      type: 'number',
    }));
    resetWorkbenchStore({ results: fakeResults as never });
    const conflicts = detectConflicts();
    expect(conflicts.find((c) => c.id === 'history-overflow')).toBeUndefined();
  });

  it('does not flag activitybar-stuck-hidden when autoHide is enabled', () => {
    resetWorkbenchStore({
      activityBarHidden: true,
      activityBarAutoHide: true,
      activityBarLocked: false,
    });
    const conflicts = detectConflicts();
    // 当 autoHide=true 时，stuck-hidden 不会触发（因为用户可以悬停唤回）
    // 但 locked+autoHide 冲突会触发
    expect(conflicts.find((c) => c.id === 'activitybar-stuck-hidden')).toBeUndefined();
  });

  it('flags activitybar-stuck-hidden when hidden and no autoHide and not locked', () => {
    resetWorkbenchStore({
      activityBarHidden: true,
      activityBarAutoHide: false,
      activityBarLocked: false,
    });
    const conflicts = detectConflicts();
    const target = conflicts.find((c) => c.id === 'activitybar-stuck-hidden');
    expect(target).toBeDefined();
    expect(target?.severity).toBe('info');
  });
});

/* ----------------------------- summarizeConflicts ----------------------------- */

describe('summarizeConflicts', () => {
  it('returns zero counts for empty conflicts', () => {
    const s = summarizeConflicts([]);
    expect(s.total).toBe(0);
    expect(s.warning).toBe(0);
    expect(s.error).toBe(0);
    expect(s.info).toBe(0);
    expect(s.hasActionable).toBe(false);
  });

  it('counts warnings correctly', () => {
    resetWorkbenchStore({
      editorVisible: false,
      previewVisible: false,
      activityBarLocked: true,
      activityBarAutoHide: true,
    });
    const conflicts = detectConflicts();
    const s = summarizeConflicts(conflicts);
    expect(s.warning).toBeGreaterThanOrEqual(2);
    expect(s.hasActionable).toBe(true);
  });

  it('hasActionable is false when only info-level conflicts exist', () => {
    resetWorkbenchStore({
      viewMode: 'pipeline' as const,
      editorVisible: false,
      previewVisible: true, // 避免 no-visible-panel
    });
    const conflicts = detectConflicts();
    const s = summarizeConflicts(conflicts);
    expect(s.warning).toBe(0);
    expect(s.error).toBe(0);
    expect(s.info).toBeGreaterThan(0);
    expect(s.hasActionable).toBe(false);
  });

  it('total equals sum of all severity counts', () => {
    resetWorkbenchStore({
      editorVisible: false,
      previewVisible: false,
      activityBarLocked: true,
      activityBarAutoHide: true,
      viewMode: 'pipeline' as const,
    });
    const conflicts = detectConflicts();
    const s = summarizeConflicts(conflicts);
    expect(s.total).toBe(s.warning + s.error + s.info);
  });
});
