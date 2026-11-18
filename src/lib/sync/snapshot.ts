/**
 * OmniMath Pro — workspace snapshot backup
 *
 * A snapshot is a plain JSON file containing every local `omnimath*`
 * localStorage record (notes, boards, scripts, settings, glyph bank, …).
 * It is the first step toward multi-device sync: export on one device,
 * import on another. Secrets (AI API keys) are never included.
 */

export const SNAPSHOT_APP = 'omnimath' as const;
export const SNAPSHOT_VERSION = 1 as const;
export const SNAPSHOT_EXTENSION = 'json';

const KEY_PREFIX = 'omnimath';
const SECRET_PREFIXES = ['omnimath:ai:'];

export interface WorkspaceSnapshot {
  app: typeof SNAPSHOT_APP;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  /** localStorage key → raw string value. */
  keys: Record<string, string>;
}

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
  return Object.entries(v.keys).every(
    ([k, val]) => k.startsWith(KEY_PREFIX) && !isSecretKey(k) && typeof val === 'string',
  );
}

export interface ImportResult {
  written: number;
  skipped: number;
  removed: number;
}

/**
 * Apply a snapshot.
 *
 * - `replace`: remove all local app records, then write the snapshot
 *   (a true restore).
 * - `merge`: keep existing records and only fill in missing keys.
 *
 * Secrets are never removed or overwritten.
 */
export function applySnapshot(
  snapshot: WorkspaceSnapshot,
  mode: 'replace' | 'merge',
): ImportResult {
  const result: ImportResult = { written: 0, skipped: 0, removed: 0 };
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
    if (mode === 'merge' && localStorage.getItem(key) !== null) {
      result.skipped++;
      continue;
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
