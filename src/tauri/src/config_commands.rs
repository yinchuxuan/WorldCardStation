use crate::app_storage::AppStorage;
use crate::json_store::{read_json, write_json, AppResult};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

const BACKGROUND_EVENT: &str = "background-config-changed";
pub(crate) const USER_BACKGROUND_URL: &str = "local://user-background/current";
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp"];

fn public_background(mut config: Value) -> Value {
    if let Some(object) = config.as_object_mut() {
        object.remove("backgroundImagePath");
    }
    config
}

pub(crate) async fn load_model(storage: &AppStorage) -> AppResult<Value> {
    let path = storage.model_config_path();
    let _guard = storage.lock(&path).await;
    Ok(read_json(&path)?.unwrap_or_else(|| {
        json!({
            "apiUrl": "", "apiKey": "", "modelName": ""
        })
    }))
}

pub(crate) async fn save_model(storage: &AppStorage, config: Value) -> AppResult<Value> {
    let path = storage.model_config_path();
    let _guard = storage.lock(&path).await;
    write_json(&path, &config)?;
    Ok(config)
}

pub(crate) async fn load_background(storage: &AppStorage) -> AppResult<Value> {
    let path = storage.background_config_path();
    let _guard = storage.lock(&path).await;
    let config = read_json(&path)?.unwrap_or_else(|| {
        json!({
            "backgroundImageUrl": "", "backgroundOpacity": 0.5
        })
    });
    Ok(public_background(config))
}

pub(crate) async fn save_background(storage: &AppStorage, config: Value) -> AppResult<Value> {
    let path = storage.background_config_path();
    let _guard = storage.lock(&path).await;
    let visible = public_background(config);
    let local_url = visible.get("backgroundImageUrl").and_then(Value::as_str);
    let mut stored = visible.clone();
    if local_url == Some(USER_BACKGROUND_URL) {
        let existing = read_json::<Value>(&path)?.unwrap_or_else(|| json!({}));
        let selected = storage.pending_background().await.or_else(|| {
            existing
                .get("backgroundImagePath")
                .and_then(Value::as_str)
                .map(PathBuf::from)
        });
        let selected = selected.ok_or_else(|| "User background is not authorized".to_string())?;
        let real_path = validate_background_path(&selected)?;
        stored["backgroundImagePath"] = Value::String(real_path.to_string_lossy().into_owned());
    } else if local_url.is_some_and(|url| url.starts_with("local://")) {
        return Err("Local background URL is not authorized".to_string());
    }
    write_json(&path, &stored)?;
    if local_url == Some(USER_BACKGROUND_URL) {
        storage.clear_pending_background().await;
    }
    Ok(visible)
}

pub(crate) fn validate_background_path(path: &Path) -> AppResult<PathBuf> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Unsupported background image type".to_string())?;
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Unsupported background image type".to_string());
    }
    let real_path = path
        .canonicalize()
        .map_err(|_| "Background image file not found".to_string())?;
    if !real_path.is_file() {
        return Err("Background image must be a file".to_string());
    }
    Ok(real_path)
}

pub(crate) async fn authorize_background(storage: &AppStorage, path: &Path) -> AppResult<()> {
    storage
        .set_pending_background(validate_background_path(path)?)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn get_model_config(state: State<'_, AppStorage>) -> AppResult<Value> {
    load_model(&state).await
}

#[tauri::command]
pub async fn save_model_config(state: State<'_, AppStorage>, config: Value) -> AppResult<Value> {
    save_model(&state, config).await
}

#[tauri::command]
pub async fn get_background_config(state: State<'_, AppStorage>) -> AppResult<Value> {
    load_background(&state).await
}

#[tauri::command]
pub async fn select_background_image(
    app: AppHandle,
    state: State<'_, AppStorage>,
) -> AppResult<Option<String>> {
    #[cfg(feature = "e2e")]
    if let Some(path) = std::env::var_os("WORLD_CARD_STATION_E2E_BACKGROUND_PATH") {
        authorize_background(&state, Path::new(&path)).await?;
        return Ok(Some(USER_BACKGROUND_URL.to_string()));
    }
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("图片文件", IMAGE_EXTENSIONS)
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    authorize_background(&state, &path).await?;
    Ok(Some(USER_BACKGROUND_URL.to_string()))
}

#[tauri::command]
pub async fn save_background_config(
    app: AppHandle,
    state: State<'_, AppStorage>,
    config: Value,
) -> AppResult<Value> {
    let saved = save_background(&state, config).await?;
    app.emit(BACKGROUND_EVENT, &saved)
        .map_err(|error| error.to_string())?;
    Ok(saved)
}
