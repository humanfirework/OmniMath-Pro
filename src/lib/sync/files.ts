/**
 * 带文件树的快照收集 / 应用。
 *
 * localStorage 快照（`collectSnapshot`）装不下代码文件，文件树实际存在
 * IndexedDB。这里在同步入口处补上 `files` 字段，并在拉取时把远端文件树
 * 合并进本机 IndexedDB；旧快照没有 `files` 时保持原行为。
 */

import { collectSnapshot, type WorkspaceSnapshot } from './snapshot';
import {
  exportFileNodesForSync,
  mergeRemoteFileNodes,
} from '@/lib/store/fileSystemStore';
import type { FileMergeResult } from './fileMerge';

/** 收集工作区快照，附带文件树（IndexedDB 不可用时退化为只同步 localStorage）。 */
export async function collectSnapshotWithFiles(): Promise<WorkspaceSnapshot> {
  const snapshot = collectSnapshot();
  try {
    const nodes = await exportFileNodesForSync();
    if (nodes && Object.keys(nodes).length > 0) snapshot.files = nodes;
  } catch {
    // IndexedDB 不可用（隐私模式 / 老 WebView）：文件同步跳过，其余照常。
  }
  return snapshot;
}

/** 把快照里的文件树合并进本机；没有文件字段时返回 null。 */
export async function applySnapshotFiles(
  snapshot: WorkspaceSnapshot,
): Promise<FileMergeResult | null> {
  if (!snapshot.files || Object.keys(snapshot.files).length === 0) return null;
  try {
    return await mergeRemoteFileNodes(snapshot.files);
  } catch {
    return null;
  }
}
