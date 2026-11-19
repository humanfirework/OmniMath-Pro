/**
 * 版本号比较：只判断远端版本是否比当前版本更新。
 *
 * 以前 SettingsPanel 直接用 `latestVersion !== currentVersion`，只要 GitHub 的
 * latest release 比当前版本旧（例如 prerelease 不会成为 latest），就会提示
 * “发现新版本 v0.1.4（当前 v0.1.6）”，看起来像版本号错乱。这里按数字段比较。
 */

function parseVersion(version: string): number[] {
  // 只比较主版本号：0.1.6-beta.2 与 0.1.6 视为同一版本，避免把
  // prerelease 的数字后缀当成“更高”。
  const core = version.replace(/^[vV]/, '').split(/[-+]/)[0];
  return core.split('.').map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function isVersionNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
