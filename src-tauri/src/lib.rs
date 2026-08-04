// OmniMath Pro — Tauri 桌面壳主入口
// 后续融合创新功能（Python sidecar / sympy / numpy / AI）时，
// 在这里注册新的 #[tauri::command]，并通过 invoke_handler 暴露给前端。
// 前端统一通过 src/lib/tauri.ts 调用。

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// 应用级共享状态（由 Tauri 托管，线程安全）。
struct AppState {
    /// 关闭窗口时是否最小化到系统托盘（由前端设置面板同步）。
    minimize_to_tray: bool,
}

/// 前端设置开关后调用，把「最小化到托盘」偏好同步到后端。
#[tauri::command]
fn set_minimize_to_tray(app: tauri::AppHandle, enabled: bool) {
    if let Some(state) = app.try_state::<Mutex<AppState>>() {
        if let Ok(mut s) = state.lock() {
            s.minimize_to_tray = enabled;
        }
    }
}

/// 返回当前是否启用「最小化到托盘」（供前端启动时校准开关状态）。
#[tauri::command]
fn get_minimize_to_tray(app: tauri::AppHandle) -> bool {
    app.try_state::<Mutex<AppState>>()
        .and_then(|s| s.lock().ok())
        .map(|s| s.minimize_to_tray)
        .unwrap_or(false)
}

#[tauri::command]
fn compute_advanced(expr: String) -> String {
    // 占位：当前仅回显，后续将 spawn python-engine sidecar 执行
    // sympy 符号计算 / numpy 数值计算 / MATLAB 风格脚本。
    format!("[rust:compute_advanced] received expr ({} chars): {}", expr.chars().count(), expr)
}

/// 切换主窗口的显示/隐藏（托盘单击或菜单项共用）。
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn build_tray(app: &tauri::AppHandle, icon: tauri::image::Image<'_>) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏 主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    TrayIconBuilder::with_id("omnimath-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("OmniMath Pro")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
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

            // 托管应用状态（供窗口事件与托盘命令读取）。
            app.manage(Mutex::new(AppState {
                minimize_to_tray: false,
            }));

            // 创建系统托盘图标 + 菜单。图标复用打包进应用的默认窗口图标。
            if let Some(icon) = app.default_window_icon() {
                build_tray(app.handle(), icon.clone())?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 核心逻辑：用户开启「最小化到托盘」后，点击关闭按钮时拦截默认
            // 行为，改为隐藏窗口（应用继续在后台运行），直到从托盘恢复或退出。
            if let WindowEvent::CloseRequested { api, .. } = event {
                let minimize = window
                    .app_handle()
                    .try_state::<Mutex<AppState>>()
                    .and_then(|s| s.lock().ok())
                    .map(|s| s.minimize_to_tray)
                    .unwrap_or(false);
                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            compute_advanced,
            set_minimize_to_tray,
            get_minimize_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}