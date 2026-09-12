use crate::app_storage::AppStorage;
use crate::json_store::AppResult;
use crate::runtime_trace::RuntimeTrace;
use crate::trace_files::TraceScope;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn start_session_trace(
    storage: State<'_, AppStorage>,
    trace: State<'_, RuntimeTrace>,
    scope: TraceScope,
    snapshot: Value,
) -> AppResult<Value> {
    trace.start(&storage, scope, snapshot).await
}

#[tauri::command]
pub async fn append_session_trace(
    storage: State<'_, AppStorage>,
    trace: State<'_, RuntimeTrace>,
    token: String,
    records: Vec<Value>,
) -> AppResult<()> {
    trace.append(&storage, &token, records).await
}

#[tauri::command]
pub async fn close_session_trace(trace: State<'_, RuntimeTrace>, token: String) -> AppResult<()> {
    trace.close(&token).await;
    Ok(())
}
