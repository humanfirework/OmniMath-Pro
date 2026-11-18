/**
 * OmniMath Pro — optional GitHub Gist cloud sync.
 *
 * A private Gist is a zero-backend way to move the workspace between devices:
 * the user supplies a personal access token (gist scope), the app uploads the
 * same JSON snapshot used by the local backup, and another device with the
 * same token can pull it. The token never leaves the device except as the
 * Authorization header to api.github.com, and it is excluded from snapshots.
 */

import { parseSnapshot, type WorkspaceSnapshot } from './snapshot';
import { collectSnapshotWithFiles } from './files';

export const GIST_TOKEN_KEY = 'omnimath:sync:gistToken';
export const GIST_ID_KEY = 'omnimath:sync:gistId';
export const GIST_LAST_CHECK_KEY = 'omnimath:sync:gistCheckedAt';
export const GIST_FILENAME = 'omnimath-workspace.json';
export const GIST_DESCRIPTION = 'OmniMath 工作区备份';
const API = 'https://api.github.com';

export interface GistResult {
  gistId: string;
  /** ISO timestamp from GitHub, when available. */
  updatedAt?: string;
}

export interface GistPullResult {
  snapshot: WorkspaceSnapshot;
  gistId: string;
}

/* ── Local configuration (never included in snapshots) ───────────── */

export function getGistToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(GIST_TOKEN_KEY) ?? '';
}

export function setGistToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = token.trim();
  if (trimmed) localStorage.setItem(GIST_TOKEN_KEY, trimmed);
  else localStorage.removeItem(GIST_TOKEN_KEY);
}

export function getStoredGistId(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(GIST_ID_KEY) ?? '';
}

/** 上一次成功检查 / 合并云端备份的时间（ISO 字符串）。 */
export function getLastGistCheck(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(GIST_LAST_CHECK_KEY) ?? '';
}

export function setLastGistCheck(iso: string): void {
  if (typeof localStorage === 'undefined') return;
  if (iso) localStorage.setItem(GIST_LAST_CHECK_KEY, iso);
  else localStorage.removeItem(GIST_LAST_CHECK_KEY);
}

function setStoredGistId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(GIST_ID_KEY, id);
}

/* ── Pure helpers (unit-testable) ────────────────────────────────── */

/** Build the JSON body for creating/updating the backup Gist. */
export function buildGistPayload(snapshot: WorkspaceSnapshot): {
  description: string;
  public: boolean;
  files: Record<string, { content: string }>;
} {
  return {
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_FILENAME]: { content: JSON.stringify(snapshot, null, 2) },
    },
  };
}

/** Extract the backup snapshot from a Gist API response. */
export function parseGistResponse(json: unknown): WorkspaceSnapshot {
  if (!json || typeof json !== 'object') {
    throw new Error('Gist 响应格式不正确');
  }
  const files = (json as { files?: unknown }).files;
  if (!files || typeof files !== 'object') {
    throw new Error('该 Gist 中没有备份文件');
  }
  const file = (files as Record<string, unknown>)[GIST_FILENAME];
  if (!file || typeof file !== 'object') {
    throw new Error(`该 Gist 中没有 ${GIST_FILENAME}`);
  }
  const content = (file as { content?: unknown }).content;
  if (typeof content !== 'string' || !content.trim()) {
    // GitHub truncates very large files; ask the user to keep backups under 1MB.
    throw new Error('备份文件为空或过大（Gist 单文件建议小于 1MB）');
  }
  return parseSnapshot(content);
}

/** Pick the newest Gist that contains our backup file. */
export function pickBackupGist(json: unknown): { id: string; updatedAt?: string } | null {
  if (!Array.isArray(json)) return null;
  let best: { id: string; updatedAt?: string; ts: number } | null = null;
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const files = (item as { files?: unknown }).files;
    if (typeof id !== 'string' || !files || typeof files !== 'object') continue;
    if (!(GIST_FILENAME in (files as Record<string, unknown>))) continue;
    const updatedAt = (item as { updated_at?: unknown }).updated_at;
    const ts = typeof updatedAt === 'string' ? Date.parse(updatedAt) || 0 : 0;
    if (!best || ts > best.ts) {
      best = { id, updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined, ts };
    }
  }
  return best ? { id: best.id, updatedAt: best.updatedAt } : null;
}

/* ── Network ─────────────────────────────────────────────────────── */

async function apiFetch(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  if (!token) throw new Error('请先填写 GitHub Token');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error('GitHub Token 无效或已过期');
  if (res.status === 403) throw new Error('Token 权限不足，需要 gist 权限');
  if (res.status === 404) throw new Error('找不到该 Gist（可能已被删除）');
  if (!res.ok) {
    throw new Error(`GitHub 请求失败（${res.status}）`);
  }
  return res;
}

/** Verify the token and return the GitHub login name. */
export async function testGistToken(token = getGistToken()): Promise<string> {
  const res = await apiFetch('/user', token);
  const json = (await res.json()) as { login?: unknown };
  if (typeof json.login !== 'string') throw new Error('无法读取 GitHub 账户信息');
  return json.login;
}

/** Find the newest backup Gist owned by the token holder. */
export async function findBackupGist(token = getGistToken()): Promise<string | null> {
  const res = await apiFetch('/gists?per_page=100', token);
  const json = await res.json();
  const picked = pickBackupGist(json);
  return picked?.id ?? null;
}

/** Upload the current workspace. Creates the Gist on first use. */
export async function pushToGist(token = getGistToken()): Promise<GistResult> {
  const snapshot = await collectSnapshotWithFiles();
  const payload = JSON.stringify(buildGistPayload(snapshot));
  const storedId = getStoredGistId();
  if (storedId) {
    try {
      const res = await apiFetch(`/gists/${storedId}`, token, {
        method: 'PATCH',
        body: payload,
      });
      const json = (await res.json()) as { id?: unknown; updated_at?: unknown };
      const gistId = typeof json.id === 'string' ? json.id : storedId;
      setStoredGistId(gistId);
      return {
        gistId,
        updatedAt: typeof json.updated_at === 'string' ? json.updated_at : undefined,
      };
    } catch (err) {
      // Stored Gist was deleted: fall through and create a new one.
      if (!(err instanceof Error) || !err.message.includes('找不到该 Gist')) throw err;
    }
  }

  // Prefer updating an existing backup Gist found on this account.
  const existing = await findBackupGist(token).catch(() => null);
  if (existing) {
    const res = await apiFetch(`/gists/${existing}`, token, {
      method: 'PATCH',
      body: payload,
    });
    const json = (await res.json()) as { id?: unknown; updated_at?: unknown };
    const gistId = typeof json.id === 'string' ? json.id : existing;
    setStoredGistId(gistId);
    return {
      gistId,
      updatedAt: typeof json.updated_at === 'string' ? json.updated_at : undefined,
    };
  }

  const res = await apiFetch('/gists', token, { method: 'POST', body: payload });
  const json = (await res.json()) as { id?: unknown; updated_at?: unknown };
  if (typeof json.id !== 'string') throw new Error('GitHub 未返回 Gist ID');
  setStoredGistId(json.id);
  return {
    gistId: json.id,
    updatedAt: typeof json.updated_at === 'string' ? json.updated_at : undefined,
  };
}

/** 只读取 Gist 的更新时间，用于启动时判断是否需要提示合并。 */
export async function getGistUpdatedAt(
  token = getGistToken(),
): Promise<{ gistId: string; updatedAt?: string }> {
  const gistId = getStoredGistId() || (await findBackupGist(token));
  if (!gistId) throw new Error('还没有云端备份，请先上传一次');
  const res = await apiFetch(`/gists/${gistId}`, token);
  const json = (await res.json()) as { id?: unknown; updated_at?: unknown };
  setStoredGistId(gistId);
  return {
    gistId,
    updatedAt: typeof json.updated_at === 'string' ? json.updated_at : undefined,
  };
}

/** Download the workspace snapshot from the stored (or discovered) Gist. */
export async function pullFromGist(token = getGistToken()): Promise<GistPullResult> {
  const gistId = getStoredGistId() || (await findBackupGist(token));
  if (!gistId) throw new Error('还没有云端备份，请先上传一次');
  const res = await apiFetch(`/gists/${gistId}`, token);
  const json = await res.json();
  const snapshot = parseGistResponse(json);
  setStoredGistId(gistId);
  return { snapshot, gistId };
}
