'use client';

/**
 * 启动时检查云端备份（可选）。
 *
 * 只在用户开启「启动时检查云端更新」且本机保存了 GitHub Token 时执行：
 *   1. 读取 Gist 的 updated_at；
 *   2. 比上次检查更新时弹一条可操作的提示（不会自动覆盖本机）；
 *   3. 用户点「合并」后才拉取、按记录 + 文件树合并，然后重新载入界面。
 *
 * 网络 / Token 错误全部静默：离线启动不应被打扰。
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useSettingsStore } from '@/lib/store/settingsStore';
import {
  getGistToken,
  getGistUpdatedAt,
  getLastGistCheck,
  pullFromGist,
  setLastGistCheck,
} from '@/lib/sync/gist';
import { applySnapshot } from '@/lib/sync/snapshot';
import { applySnapshotFiles } from '@/lib/sync/files';
import { isRemoteNewer } from '@/lib/sync/autoCheck';

const CHECK_DELAY_MS = 2500;

export function useCloudAutoCheck(): void {
  const enabled = useSettingsStore((s) => s.cloudAutoCheck);

  useEffect(() => {
    if (!enabled) return;
    const token = getGistToken();
    if (!token) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { updatedAt } = await getGistUpdatedAt(token);
          if (cancelled || !isRemoteNewer(updatedAt, getLastGistCheck())) return;
          toast('云端有较新的备份', {
            description: '来自另一台设备的更改。合并会保留本机较新的记录，不会覆盖。',
            duration: 12000,
            action: {
              label: '合并',
              onClick: () => {
                void (async () => {
                  try {
                    const { snapshot } = await pullFromGist(token);
                    const result = applySnapshot(snapshot, 'merge');
                    const files = await applySnapshotFiles(snapshot);
                    if (updatedAt) setLastGistCheck(updatedAt);
                    const filesNote =
                      files && (files.added > 0 || files.updated > 0)
                        ? `，文件 +${files.added} / 更新 ${files.updated}`
                        : '';
                    toast.success(
                      `已合并 ${result.merged} 项记录、补全 ${result.written} 项${filesNote}`,
                      { description: '即将重新载入界面…', duration: 1800 },
                    );
                    setTimeout(() => {
                      if (typeof window !== 'undefined') window.location.reload();
                    }, 800);
                  } catch (err) {
                    toast.error('云端合并失败', { description: (err as Error).message });
                  }
                })();
              },
            },
          });
        } catch {
          // 离线 / Token 失效 / 没有备份：启动检查保持安静。
        }
      })();
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);
}
