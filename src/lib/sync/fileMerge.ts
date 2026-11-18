/**
 * 文件树合并 — 纯函数（无 IndexedDB / React），用于多端同步。
 *
 * 同步策略：按节点 id 并集；同一 id 以 `updatedAt` 较新者为准（本机较新则
 * 保留本机）。不删除任何一侧的节点 —— 删除同步需要墓碑记录，属于后续工作。
 */

import type { FileNode } from '@/lib/store/fileSystemStore';

export interface FileMergeResult {
  nodes: Record<string, FileNode>;
  added: number;
  updated: number;
  kept: number;
}

function isFileNode(value: unknown): value is FileNode {
  if (!value || typeof value !== 'object') return false;
  const n = value as Partial<FileNode>;
  return (
    typeof n.id === 'string' &&
    n.id.length > 0 &&
    typeof n.name === 'string' &&
    (n.type === 'file' || n.type === 'folder') &&
    Number.isFinite(n.createdAt) &&
    Number.isFinite(n.updatedAt)
  );
}

/**
 * Merge `remote` into `local`. Returns a new nodes map plus counters so the UI
 * can report what actually changed.
 */
export function mergeFileNodes(
  local: Record<string, FileNode> | null | undefined,
  remote: Record<string, FileNode> | null | undefined,
): FileMergeResult {
  const nodes: Record<string, FileNode> = {};
  for (const [id, node] of Object.entries(local ?? {})) {
    if (isFileNode(node)) nodes[id] = node;
  }

  let added = 0;
  let updated = 0;
  let kept = 0;

  for (const [id, remoteNode] of Object.entries(remote ?? {})) {
    if (!isFileNode(remoteNode)) continue;
    const localNode = nodes[id];
    if (!localNode) {
      nodes[id] = remoteNode;
      added++;
      continue;
    }
    if (remoteNode.updatedAt > localNode.updatedAt) {
      // 文件夹的展开状态是本机 UI 偏好，不被远端覆盖。
      nodes[id] = localNode.type === 'folder'
        ? { ...remoteNode, expanded: localNode.expanded ?? remoteNode.expanded }
        : remoteNode;
      updated++;
    } else {
      kept++;
    }
  }

  // 父节点缺失（例如只同步到子节点）时挂到根，避免节点在树里不可见。
  for (const node of Object.values(nodes)) {
    if (node.parentId && !nodes[node.parentId]) {
      nodes[node.id] = { ...node, parentId: null };
    }
  }

  return { nodes, added, updated, kept };
}
