use crate::app_storage::AppStorage;
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_repository;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn get_game_cards(state: State<'_, AppStorage>) -> CardResult<Vec<Value>> {
    game_card_repository::list(&state).await
}

#[tauri::command]
pub async fn get_game_card(state: State<'_, AppStorage>, id: String) -> CardResult<Option<Value>> {
    game_card_repository::get(&state, &id).await
}

#[cfg(feature = "e2e")]
#[tauri::command]
pub async fn e2e_seed_game_card(state: State<'_, AppStorage>, card: Value) -> CardResult<Value> {
    game_card_repository::save(&state, card).await?;
    Ok(json!({}))
}

#[tauri::command]
pub async fn import_game_card_from_file(
    app: AppHandle,
    state: State<'_, AppStorage>,
    tavern_only: Option<bool>,
) -> CardResult<Value> {
    if tavern_only.unwrap_or(false) {
        return Err(GameCardError::new(
            "酒馆转换尚未支持 formatVersion 1，请先迁移为原生游戏卡。",
        ));
    }
    #[cfg(feature = "e2e")]
    if let Some(path) = std::env::var_os("WORLD_CARD_STATION_E2E_IMPORT_FILE") {
        return crate::player_card_import::import(&state, std::path::Path::new(&path)).await;
    }
    let selected = app
        .dialog()
        .file()
        .set_title(if tavern_only.unwrap_or(false) {
            "更新酒馆卡：选择 V2/V3 酒馆源文件"
        } else {
            "导入卡片：选择卡片文件或项目的 card.json（导入整个目录）"
        })
        .add_filter("卡片文件", &["gamecard", "png", "apng", "json", "charx"])
        .blocking_pick_file()
        .ok_or_else(GameCardError::canceled)?;
    let path = selected
        .into_path()
        .map_err(|error| GameCardError::new(error.to_string()))?;
    crate::player_card_import::import(&state, &path).await
}

#[tauri::command]
pub async fn set_active_game_card(
    state: State<'_, AppStorage>,
    id: Option<String>,
) -> CardResult<Value> {
    if let Some(id) = id.as_deref() {
        crate::player_card_import::validate_installed(&state, id)?;
    }
    game_card_repository::set_active(&state, id.as_deref()).await?;
    Ok(json!({}))
}

#[tauri::command]
pub async fn delete_game_card(state: State<'_, AppStorage>, id: String) -> CardResult<Value> {
    game_card_repository::delete(&state, &id).await?;
    Ok(json!({}))
}

#[tauri::command]
pub async fn get_active_game_card(state: State<'_, AppStorage>) -> CardResult<Option<Value>> {
    let card = game_card_repository::active(&state).await?;
    if let Some(id) = card.as_ref().and_then(|card| card["id"].as_str()) {
        crate::player_card_import::validate_installed(&state, id)?;
    }
    Ok(card)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn read_game_card_file(
    state: State<'_, AppStorage>,
    card_id: String,
    relative_path: String,
) -> CardResult<String> {
    game_card_repository::read_text(&state, &card_id, &relative_path).await
}
