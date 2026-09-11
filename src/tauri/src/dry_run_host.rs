use crate::dry_run::PreparedCheck;
use crate::game_card_paths::existing_file;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct CheckState {
    prepared: PreparedCheck,
    result: Arc<Mutex<Option<Value>>>,
}

#[tauri::command]
fn dry_run_card(state: tauri::State<CheckState>) -> Value {
    state.prepared.expanded.card.clone()
}

#[tauri::command]
fn dry_run_read(file: String, state: tauri::State<CheckState>) -> Result<String, String> {
    let path = existing_file(&state.prepared.root, &file).map_err(|error| error.error)?;
    std::fs::read_to_string(path).map_err(|error| format!("{file}: {error}"))
}

#[tauri::command]
fn dry_run_finish(result: Value, app: tauri::AppHandle, state: tauri::State<CheckState>) {
    let mut slot = state.result.lock().unwrap();
    if slot.is_none() {
        *slot = Some(result);
    }
    app.exit(0);
}

pub fn check(
    prepared: PreparedCheck,
    mut context: tauri::Context<tauri::Wry>,
) -> Result<Value, String> {
    #[cfg(target_os = "linux")]
    if std::env::var_os("DISPLAY").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return Err(
            "JavaScript 语法检查需要本机桌面 WebView 环境；当前没有 DISPLAY 或 WAYLAND_DISPLAY"
                .into(),
        );
    }
    let profile = crate::dry_run_profile::CheckProfile::new()?;
    let profile_path = profile.0.clone();
    let result = Arc::new(Mutex::new(None));
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url = None;
    context.set_assets(Box::new(crate::dry_run_assets::CheckAssets));
    let state = CheckState {
        prepared,
        result: result.clone(),
    };
    #[allow(unused_mut)]
    let mut app = tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![dry_run_card, dry_run_read, dry_run_finish])
        .setup(move |app| {
            let created = WebviewWindowBuilder::new(app, "dry-run", WebviewUrl::App("index.html".into()))
                .visible(false).focused(false).skip_taskbar(true).incognito(true)
                .data_directory(profile_path)
                .disable_drag_drop_handler().devtools(false)
                .initialization_script("for (const kind of ['error', 'unhandledrejection']) window.addEventListener(kind, event => window.__TAURI_INTERNALS__.invoke('dry_run_finish', {result: {failure: String(event.message || event.reason || '检查器脚本加载失败')}}));")
                .on_navigation(|url| {
                    matches!((url.scheme(), url.host_str()), ("tauri", Some("localhost")) | ("http", Some("tauri.localhost")))
                        && matches!(url.path(), "" | "/" | "/index.html")
                })
                .build();
            if let Err(error) = created {
                *app.state::<CheckState>().result.lock().unwrap() = Some(json!({ "failure": error.to_string() }));
                app.handle().exit(3);
            }
            Ok(())
        })
        .build(context).map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
    let handle = app.handle().clone();
    let pending = result.clone();
    let (stop, stopped) = std::sync::mpsc::channel::<()>();
    let watchdog = std::thread::spawn(move || {
        if stopped
            .recv_timeout(std::time::Duration::from_secs(30))
            .is_ok()
        {
            return;
        }
        let mut slot = pending.lock().unwrap();
        if slot.is_none() {
            *slot = Some(json!({ "failure": "语法检查器启动或检查超时（30 秒）" }));
            handle.exit(3);
        }
    });
    app.run_return(|_, _| {});
    let _ = stop.send(());
    let _ = watchdog.join();
    let output = result
        .lock()
        .unwrap()
        .take()
        .ok_or("语法检查器退出但没有返回结果")?;
    Ok(output)
}
