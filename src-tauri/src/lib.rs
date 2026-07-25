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
