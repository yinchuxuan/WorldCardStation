use crate::app_storage::AppStorage;
use crate::history::{self, SaveOptions};
use crate::json_store::{read_json, write_json, AppResult};
use crate::session_management;
use crate::sessions::{self, SessionMeta};
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn get_chat_history(state: State<'_, AppStorage>) -> AppResult<Value> {
    load_history(&state).await
}

pub(crate) async fn load_history(storage: &AppStorage) -> AppResult<Value> {
    let root = sessions::session_root(&storage.game_cards_dir())?;
    let context = sessions::active_context(&root)?;
    let _guard = storage.lock(&context.dir).await;
    let messages = read_json::<Value>(&context.messages)?;
    let retry = read_json::<Value>(&context.retry_base)?;
    let mut result = history::decode_history(messages.as_ref(), retry.as_ref());
    let card = root
        .parent()
        .filter(|parent| parent.parent() == Some(storage.game_cards_dir().join("cards").as_path()));
    result["traceScope"] = card
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .map(|id| json!({ "cardId": id, "sessionId": context.id }))
        .unwrap_or(Value::Null);
    Ok(result)
}

#[tauri::command]
pub async fn save_chat_history(
    state: State<'_, AppStorage>,
    messages: Value,
    options: Option<SaveOptions>,
) -> AppResult<Value> {
    save_history(&state, messages, options.unwrap_or_default()).await
}

pub(crate) async fn save_history(
    storage: &AppStorage,
    messages: Value,
    options: SaveOptions,
) -> AppResult<Value> {
    let root = sessions::session_root(&storage.game_cards_dir())?;
    let context = sessions::active_context(&root)?;
    let encoded = history::encode_history(&messages, &options);
    let retry = history::encode_retry_base(&options);
    let _guard = storage.lock(&context.dir).await;
    sessions::ensure_files(&context)?;
    write_json(&context.messages, &encoded)?;
    write_json(&context.retry_base, &retry)?;
    let saved_messages = encoded
        .get("messages")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    sessions::update_meta(
        &root,
        &context.id,
        saved_messages,
        history::preview(saved_messages),
    )?;
    Ok(json!({}))
}

async fn list_sessions(storage: &AppStorage) -> AppResult<(Vec<SessionMeta>, String)> {
    let root = sessions::session_root(&storage.game_cards_dir())?;
    let _guard = storage.lock(&root).await;
    sessions::list(&root)
}

#[tauri::command]
pub async fn list_chat_sessions(state: State<'_, AppStorage>) -> AppResult<Value> {
    let (items, active_id) = list_sessions(&state).await?;
    Ok(json!({ "sessions": items, "activeId": active_id }))
}

#[tauri::command]
pub async fn get_active_chat_session(
    state: State<'_, AppStorage>,
) -> AppResult<Option<SessionMeta>> {
    let (items, active_id) = list_sessions(&state).await?;
    Ok(items.into_iter().find(|item| item.id == active_id))
}

#[tauri::command]
pub async fn create_chat_session(
    state: State<'_, AppStorage>,
    title: Option<String>,
) -> AppResult<Value> {
    let root = sessions::session_root(&state.game_cards_dir())?;
    let _guard = state.lock(&root).await;
    let id = session_management::create(&root, title.as_deref().unwrap_or("新会话"))?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
pub async fn set_active_chat_session(state: State<'_, AppStorage>, id: String) -> AppResult<Value> {
    let root = sessions::session_root(&state.game_cards_dir())?;
    let _guard = state.lock(&root).await;
    session_management::set_active(&root, &id)?;
    Ok(json!({ "id": id }))
}

#[tauri::command]
pub async fn rename_chat_session(
    state: State<'_, AppStorage>,
    id: String,
    title: String,
) -> AppResult<SessionMeta> {
    let root = sessions::session_root(&state.game_cards_dir())?;
    let _guard = state.lock(&root).await;
    session_management::rename(&root, &id, &title)
}

#[tauri::command]
pub async fn delete_chat_session(state: State<'_, AppStorage>, id: String) -> AppResult<Value> {
    let root = sessions::session_root(&state.game_cards_dir())?;
    let _guard = state.lock(&root).await;
    Ok(json!({ "id": session_management::delete(&root, &id)? }))
}
