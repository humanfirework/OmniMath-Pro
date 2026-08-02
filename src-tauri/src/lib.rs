// OmniMath Pro — Tauri 桌面壳主入口
// 后续融合创新功能（Python sidecar / sympy / numpy / AI）时，
// 在这里注册新的 #[tauri::command]，并通过 invoke_handler 暴露给前端。
// 前端统一通过 src/lib/tauri.ts 调用。

#[tauri::command]
fn compute_advanced(expr: String) -> String {
    // 占位：当前仅回显，后续将 spawn python-engine sidecar 执行
    // sympy 符号计算 / numpy 数值计算 / MATLAB 风格脚本。
    format!("[rust:compute_advanced] received expr ({} chars): {}", expr.chars().count(), expr)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Windows, some WebView2 / GPU driver combinations ship with
    // WebGL2 (and sometimes even WebGL1) disabled at the ANGLE layer by
    // default — this is the #1 reason users report "my local 3D doesn't
    // display but localhost works fine" (the browser ships with its own
    // ANGLE build; WebView2 defers to whatever the OS ships).
    //
    // We configure the GPU flags via the official WebView2 environment
    // variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` instead of the
    // `tauri::WebviewBuilder` unstable API.  This env var is read by
    // WebView2 itself on process start; setting it before `Builder::run`
    // guarantees every webview picks it up.  On non-Windows platforms it
    // is a harmless no-op.
    //
    // Keys:
    //   --enable-webgl2-compute-context : unblocks WebGL2 compute (R3F uses this)
    //   --enable-unsafe-webgpu          : forward-proof for a future WebGPU backend
    //   --use-gl=angle                  : forces ANGLE (Chrome's default, widest
    //                                      Three.js compatibility)
    //   --use-angle=default             : let ANGLE pick D3D11/GL backend
    //   --enable-gpu-rasterization      : 2D Plot2DCanvas rasterizes ~3× faster
    //   --enable-zero-copy              : avoid CPU upload copies when possible
    //   --ignore-gpu-blocklist          : bypass driver-deny-lists that ship with
    //                                      WebView2 and can silently drop WebGL2
    #[cfg(target_os = "windows")]
    {
        const ARGS: &str = "\
            --enable-webgl2-compute-context \
            --enable-unsafe-webgpu \
            --use-gl=angle \
            --use-angle=default \
            --enable-gpu-rasterization \
            --enable-zero-copy \
            --ignore-gpu-blocklist";
        // Append to any user-provided flags rather than clobbering them.
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        if existing.trim().is_empty() {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", ARGS);
        } else {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", format!("{} {}", existing, ARGS));
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![compute_advanced])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
