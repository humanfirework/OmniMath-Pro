// 前端 ↔ Tauri(Rust) 桥接层
// - 在 Tauri 桌面壳内：通过 @tauri-apps/api 的 invoke 调用 Rust 命令
// - 在纯浏览器（bun run dev / 预览）：自动降级，返回占位结果，不阻塞 UI
//
// 后续融合创新功能（Python sidecar / sympy / numpy / AI）时，
// 只需在 Rust 端扩展命令，前端通过这里统一调用。

import { invoke, isTauri } from "@tauri-apps/api/core";

export function inTauri(): boolean {
  return isTauri();
}

export interface AdvancedResult {
  ok: boolean;
  source: "tauri" | "web-fallback";
  result?: unknown;
  error?: string;
}

/**
 * 调用 Rust 端的高级计算命令（占位：当前返回确认信息；
 * 后续将桥接到 Python sidecar 执行 sympy/numpy 计算）。
 */
export async function computeAdvanced(expr: string): Promise<AdvancedResult> {
  if (!inTauri()) {
    // 浏览器降级：交给前端 mathjs 引擎处理
    return {
      ok: false,
      source: "web-fallback",
      error: "desktop-only command (use the in-browser mathjs engine instead)",
    };
  }
  try {
    const result = await invoke<unknown>("compute_advanced", { expr });
    return { ok: true, source: "tauri", result };
  } catch (e) {
    return { ok: false, source: "tauri", error: String(e) };
  }
}

/**
 * 把「最小化到托盘」偏好同步到 Rust 端（仅桌面壳内生效）。
 * 浏览器环境直接忽略，返回 false。
 */
export async function setMinimizeToTray(enabled: boolean): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    await invoke("set_minimize_to_tray", { enabled });
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取当前是否启用「最小化到托盘」（供前端启动时校准开关状态）。
 * 浏览器环境返回 false。
 */
export async function getMinimizeToTray(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("get_minimize_to_tray");
  } catch {
    return false;
  }
}
