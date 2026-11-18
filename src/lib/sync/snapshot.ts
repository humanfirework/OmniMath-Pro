/**
 * OmniMath Pro — workspace snapshot backup
 *
 * A snapshot is a plain JSON file containing every local `omnimath*`
 * localStorage record (notes, boards, scripts, settings, glyph bank, …).
 * It is the first step toward multi-device sync: export on one device,
 * import on another. Secrets (AI API keys) are never included.
 */

import type { FileNode } from '@/lib/store/fileSystemStore';

export const SNAPSHOT_APP = 'omnimath' as const;
export const SNAPSHOT_VERSION = 1 as const;
export const SNAPSHOT_EXTENSION = 'json';

const KEY_PREFIX = 'omnimath';
const SECRET_PREFIXES = ['omnimath:ai:', 'omnimath:sync:'];

export interface WorkspaceSnapshot {
  app: typeof SNAPSHOT_APP;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  /** localStorage key → raw string value. */
  keys: Record<string, string>;
  /**
   * 文件树（代码文件 / 文件夹，正文随节点一起同步）。
   *
   * 文件正文存放在 IndexedDB（localStorage 放不下），所以不能塞进 `keys`。
   * 旧版本快照没有该字段，读取时按「没有文件可同步」处理。
   */
  files?: Record<string, SnapshotFileNode>;
}

/** 与 `FileNode` 结构一致（type-only 引入，不把 store 的运行时拖进 sync 层）。 */
export type SnapshotFileNode = FileNode;

function isSecretKey(key: string): boolean {
  return SECRET_PREFIXES.some((p) => key.startsWith(p));
}

/** Collect the current device's workspace into an exportable snapshot. */
export function collectSnapshot(): WorkspaceSnapshot {
  const keys: Record<string, string> = {};
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX) || isSecretKey(key)) continue;
      const value = localStorage.getItem(key);
      if (typeof value === 'string') keys[key] = value;
    }
  }
  return {
    app: SNAPSHOT_APP,
    version: SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    keys,
  };
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkspaceSnapshot>;
  if (v.app !== SNAPSHOT_APP || v.version !== SNAPSHOT_VERSION) return false;
  if (!v.keys || typeof v.keys !== 'object' || Array.isArray(v.keys)) return false;
  if (!Object.entries(v.keys).every(
    ([k, val]) => k.startsWith(KEY_PREFIX) && !isSecretKey(k) && typeof val === 'string',
  )) {
    return false;
  }
  // `files` 是后加的可选字段；旧快照没有它仍然合法。存在时只做轻量结构检查，
  // 具体节点校验交给 mergeFileNodes（会丢弃非法条目）。
  if (v.files !== undefined) {
    if (!v.files || typeof v.files !== 'object' || Array.isArray(v.files)) return false;
  }
  return true;
}

export interface ImportResult {
  written: number;
  /** Existing keys whose records were merged with the incoming snapshot. */
  merged: number;
  skipped: number;
  removed: number;
}

/**
 * Which local records can be merged field-by-field instead of being skipped.
 *
 * The workbench store is one JSON blob, so a naive merge would either drop the
 * incoming device's history or overwrite the local one. We union the record
 * arrays by id (history results, plots, curve sets) and fill missing variable
 * names, keeping local entries on conflict.
 */
const RECORD_MERGE_SPECS: Record<string, { arrays?: string[]; maps?: string[] }> = {
  'omnimath-pro-v2': {
    arrays: ['results', 'plots', 'curveSets'],
    maps: ['variables'],
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Stable identity for a merged array entry (id when present, else JSON). */
function recordKey(value: unknown): string {
  if (isPlainObject(value)) {
    const id = value.id;
    if (typeof id === 'string' && id) return `id:${id}`;
  }
  try {
    return `json:${JSON.stringify(value)}`;
  } catch {
    return `json:${String(value)}`;
  }
}

/**
 * Merge two JSON blob values for a known key. Returns the merged JSON string,
 * or null when there is nothing to add (keep the local value untouched).
 */
export function mergeJsonRecords(
  localRaw: string,
  remoteRaw: string,
  spec: { arrays?: string[]; maps?: string[] },
): string | null {
  let local: unknown;
  let remote: unknown;
  try {
    local = JSON.parse(localRaw);
    remote = JSON.parse(remoteRaw);
  } catch {
    return null;
  }
  if (!isPlainObject(local) || !isPlainObject(remote)) return null;

  const merged: Record<string, unknown> = { ...remote, ...local };
  let changed = false;

  for (const field of spec.arrays ?? []) {
    const a = Array.isArray(local[field]) ? local[field] : [];
    const b = Array.isArray(remote[field]) ? remote[field] : [];
    if (a.length === 0 || b.length === 0) continue;
    const seen = new Set(a.map(recordKey));
    const extra = b.filter((item) => {
      const key = recordKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (extra.length > 0) {
      merged[field] = [...a, ...extra];
      changed = true;
    }
  }

  for (const field of spec.maps ?? []) {
    const a = isPlainObject(local[field]) ? local[field] : {};
    const b = isPlainObject(remote[field]) ? remote[field] : {};
    const union = { ...b, ...a };
    if (Object.keys(union).length !== Object.keys(a).length) {
      merged[field] = union;
      changed = true;
    }
  }

  return changed ? JSON.stringify(merged) : null;
}

/**
 * Apply a snapshot.
 *
 * - `replace`: remove all local app records, then write the snapshot
 *   (a true restore).
 * - `merge`: keep existing records and only fill in missing keys. For known
 *   record blobs (history / plots / curve sets / variables), merge records by
 *   id instead of skipping the whole key.
 *
 * Secrets are never removed or overwritten.
 */
export function applySnapshot(
  snapshot: WorkspaceSnapshot,
  mode: 'replace' | 'merge',
): ImportResult {
  const result: ImportResult = { written: 0, merged: 0, skipped: 0, removed: 0 };
  if (typeof localStorage === 'undefined') return result;

  if (mode === 'replace') {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX) && !isSecretKey(key)) toRemove.push(key);
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
      result.removed++;
    }
  }

  for (const [key, value] of Object.entries(snapshot.keys)) {
    if (mode === 'merge') {
      const existing = localStorage.getItem(key);
      if (existing !== null) {
        const spec = RECORD_MERGE_SPECS[key];
        const merged = spec ? mergeJsonRecords(existing, value, spec) : null;
        if (merged !== null) {
          localStorage.setItem(key, merged);
          result.merged++;
        } else {
          result.skipped++;
        }
        continue;
      }
    }
    localStorage.setItem(key, value);
    result.written++;
  }
  return result;
}

export function snapshotSize(snapshot: WorkspaceSnapshot): { keys: number; bytes: number } {
  let bytes = 0;
  for (const [key, value] of Object.entries(snapshot.keys)) {
    bytes += key.length + value.length;
  }
  return { keys: Object.keys(snapshot.keys).length, bytes };
}

export function snapshotFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `omnimath-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Parse a user-supplied .json file. Throws with a readable message. */
export function parseSnapshot(text: string): WorkspaceSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!isWorkspaceSnapshot(parsed)) {
    throw new Error('不是 OmniMath 备份文件，或版本不兼容');
  }
  return parsed;
}
