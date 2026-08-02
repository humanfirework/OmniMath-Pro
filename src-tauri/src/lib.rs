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
    let mut webview_builder = tauri::WebviewBuilder::new();

    // On Windows, some WebView2 / GPU driver combinations ship with
    // WebGL2 (and sometimes even WebGL1) disabled at the ANGLE layer by
    // default, which is the #1 reason users report "my local 3D doesn't
    // display but localhost works fine" (the browser ships with its own
    // ANGLE build; WebView2 defers to whatever the OS ships).
    //
    // `additional_browser_args` is accepted by every WebView builder
    // variant on every platform; on non-Windows WebKitGTK / WKWebView
    // they are safely ignored.
    //
    // Keys:
    //   --enable-webgl2-compute-context   : unblocks WebGL2 compute (R3F uses this)
    //   --enable-unsafe-webgpu            : forward-proof for a future WebGPU backend
    //   --use-gl=angle                    : forces ANGLE instead of the native D3D
    //                                        frontend, which is what Chrome uses and
    //                                        therefore has the widest Three.js support
    //   --use-angle=default               : allow ANGLE to pick D3D11/GL backend
    //   --enable-gpu-rasterization        : 2D Plot2DCanvas rasterizes ~3× faster
    //   --enable-features=VaapiVideoDecode : not used here, but harmless
    #[cfg(target_os = "windows")]
    {
        webview_builder = webview_builder.additional_browser_args(
            "--enable-webgl2-compute-context \
             --enable-unsafe-webgpu \
             --use-gl=angle \
             --use-angle=default \
             --enable-gpu-rasterization \
             --enable-zero-copy \
             --ignore-gpu-blocklist",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .webview(webview_builder)
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
