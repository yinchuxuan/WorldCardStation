use crate::app_storage::AppStorage;
use crate::game_card_error::CardResult;
use crate::tavern_output::Plan;
use crate::tavern_tasks::TavernTasks;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command(rename_all = "camelCase")]
pub async fn stage_tavern_import(
    storage: State<'_, AppStorage>,
    tasks: State<'_, TavernTasks>,
    token: String,
    plan: Plan,
    target_id: Option<String>,
) -> CardResult<Value> {
    tasks.stage(&storage, &token, plan, target_id).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn commit_tavern_import(
    storage: State<'_, AppStorage>,
    tasks: State<'_, TavernTasks>,
    network: State<'_, crate::model_commands::ModelNetworkState>,
    token: String,
    revision: String,
) -> CardResult<Value> {
    network.require_idle().await?;
    tasks.commit(&storage, &token, &revision).await
}

#[tauri::command]
pub async fn cancel_tavern_import(
    tasks: State<'_, TavernTasks>,
    token: String,
) -> CardResult<Value> {
    tasks.cancel(&token).await;
    Ok(json!({}))
}
