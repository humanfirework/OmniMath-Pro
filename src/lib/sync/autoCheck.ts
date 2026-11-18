/**
 * 启动时云同步检查的纯逻辑。
 */

/**
 * 远端备份是否比上次检查更新。
 *
 * - 远端没有时间戳 → 不提示（无法判断，宁可不动）。
 * - 本机从没检查过 → 提示（第一次连上另一台设备时应该看得到）。
 * - 时间戳损坏 → 不提示，避免每次启动都弹。
 */
export function isRemoteNewer(
  remoteIso: string | undefined | null,
  lastCheckIso: string | null | undefined,
): boolean {
  if (!remoteIso) return false;
  const remote = Date.parse(remoteIso);
  if (!Number.isFinite(remote)) return false;
  if (!lastCheckIso) return true;
  const last = Date.parse(lastCheckIso);
  if (!Number.isFinite(last)) return false;
  return remote > last;
}
