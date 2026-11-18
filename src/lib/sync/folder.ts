/**
 * OmniMath Pro — folder-based multi-device sync (desktop)
 *
 * Any folder that is already synced by OneDrive / iCloud Drive / Dropbox /
 * Syncthing can act as the transport. We simply write one snapshot file and
 * read it back on the other device — no account system, no server, no CORS.
 *
 * Manual push/pull is intentional: automatic last-writer-wins would silently
 * destroy notes. Record-level merge can build on this file later.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { inTauri } from '@/lib/tauri';
import {
  applySnapshot,
  collectSnapshot,
  parseSnapshot,
  type ImportResult,
} from './snapshot';

export const SYNC_FOLDER_KEY = 'omnimath-sync-folder';
export const SYNC_FILE_NAME = 'omnimath-workspace.json';

export function getSyncFolder(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SYNC_FOLDER_KEY);
}

export function setSyncFolder(folder: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (folder) localStorage.setItem(SYNC_FOLDER_KEY, folder);
  else localStorage.removeItem(SYNC_FOLDER_KEY);
}

/** Ask the user for a folder; returns the chosen path or null. */
export async function chooseSyncFolder(): Promise<string | null> {
  if (!inTauri()) return null;
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== 'string') return null;
  setSyncFolder(picked);
  return picked;
}

async function syncFilePath(folder: string): Promise<string> {
  return join(folder, SYNC_FILE_NAME);
}

export interface PushResult {
  path: string;
  keys: number;
  bytes: number;
}

export async function pushToSyncFolder(): Promise<PushResult> {
  const folder = getSyncFolder();
  if (!inTauri()) throw new Error('同步文件夹仅桌面版可用');
  if (!folder) throw new Error('请先选择同步文件夹');
  const snapshot = collectSnapshot();
  const json = JSON.stringify(snapshot, null, 2);
  const path = await syncFilePath(folder);
  await writeTextFile(path, json);
  return { path, keys: Object.keys(snapshot.keys).length, bytes: json.length };
}

export async function pullFromSyncFolder(
  mode: 'merge' | 'replace' = 'merge',
): Promise<ImportResult & { path: string }> {
  const folder = getSyncFolder();
  if (!inTauri()) throw new Error('同步文件夹仅桌面版可用');
  if (!folder) throw new Error('请先选择同步文件夹');
  const path = await syncFilePath(folder);
  const json = await readTextFile(path);
  const snapshot = parseSnapshot(json);
  const result = applySnapshot(snapshot, mode);
  return { ...result, path };
}
