use crate::app_storage::AppStorage;
use crate::game_card_imports::{read_card_with_sources, read_json_with_sources};
use crate::game_card_source_map::{locate, SourceMap};
use crate::json_store::AppResult;
use crate::trace_files::{self, TraceScope};
use chrono::Utc;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::Mutex;
use uuid::Uuid;

struct Capture {
    scope: TraceScope,
    sources: SourceMap,
    agent_sources: HashMap<String, SourceMap>,
    sequence: u64,
    failed: bool,
}

#[derive(Default)]
pub struct RuntimeTrace(Mutex<HashMap<String, Capture>>);

impl RuntimeTrace {
    pub async fn start(
        &self,
        storage: &AppStorage,
        scope: TraceScope,
        snapshot: Value,
    ) -> AppResult<Value> {
        if !snapshot["messages"].is_array() || !snapshot["state"].is_object() {
            return Err("Invalid trace snapshot".into());
        }
        let mut captures = self.0.lock().await;
        let root = storage.game_cards_dir().join("cards").join(&scope.card_id);
        let _guard = storage.lock(&root).await;
        // Validate the scope before reading card content or creating a trace file.
        crate::game_card_paths::require_safe_id(&scope.card_id).map_err(|error| error.error)?;
        crate::game_card_paths::require_safe_id(&scope.session_id).map_err(|error| error.error)?;
        let dir = trace_files::directory(storage, &scope, true)?;
        let expanded = read_card_with_sources(&root).map_err(|error| error.error)?;
        let mut agent_sources = HashMap::new();
        if let Some(agents) = expanded.card["agents"].as_object() {
            for (id, file) in agents {
                let file = file.as_str().ok_or("Invalid Agent file")?;
                agent_sources.insert(
                    id.clone(),
                    read_json_with_sources(&root, file)
                        .map_err(|error| error.error)?
                        .sources,
                );
            }
        }
        let fingerprint = trace_files::fingerprint(&root)?;
        let _session_guard = storage.lock(&dir).await;
        let token = Uuid::new_v4().to_string();
        let path = dir.join("trace.jsonl");
        trace_files::append(
            &path,
            &[json!({
                "type": "capture.start", "formatVersion": 1, "captureId": token, "sequence": 0,
                "cardId": scope.card_id, "sessionId": scope.session_id,
                "time": Utc::now().to_rfc3339(), "platformVersion": env!("CARGO_PKG_VERSION"),
                "schemaVersion": serde_json::from_str::<Value>(include_str!("../../shared/game-card/schema/game-card.schema.json")).unwrap()["x-schema-version"],
                "cardFingerprint": fingerprint, "snapshot": snapshot
            })],
        )?;
        captures.insert(
            token.clone(),
            Capture {
                scope,
                sources: expanded.sources,
                agent_sources,
                sequence: 1,
                failed: false,
            },
        );
        Ok(json!({ "token": token, "path": path }))
    }

    pub async fn append(
        &self,
        storage: &AppStorage,
        token: &str,
        records: Vec<Value>,
    ) -> AppResult<()> {
        let mut captures = self.0.lock().await;
        let capture = captures.get_mut(token).ok_or("Trace capture is closed")?;
        if capture.failed {
            return Err("Trace is incomplete; disable and re-enable developer mode".into());
        }
        let result = async {
            let root = storage
                .game_cards_dir()
                .join("cards")
                .join(&capture.scope.card_id);
            let _guard = storage.lock(&root).await;
            let dir = trace_files::directory(storage, &capture.scope, false)?;
            let _session_guard = storage.lock(&dir).await;
            let mut output = Vec::new();
            for mut record in records {
                let item = record
                    .as_object_mut()
                    .ok_or("Trace event must be an object")?;
                if let Some(pointer) = item.get("pointer").and_then(Value::as_str) {
                    let sources = item
                        .get("agentId")
                        .and_then(Value::as_str)
                        .and_then(|id| capture.agent_sources.get(id))
                        .unwrap_or(&capture.sources);
                    item.insert(
                        "source".into(),
                        serde_json::to_value(locate(sources, pointer)).unwrap(),
                    );
                }
                item.insert("captureId".into(), json!(token));
                item.insert("cardId".into(), json!(capture.scope.card_id));
                item.insert("sessionId".into(), json!(capture.scope.session_id));
                item.insert("sequence".into(), json!(capture.sequence));
                capture.sequence += 1;
                output.push(record);
            }
            trace_files::append(&dir.join("trace.jsonl"), &output)
        }
        .await;
        if result.is_err() {
            capture.failed = true;
        }
        result
    }

    pub async fn close(&self, token: &str) {
        self.0.lock().await.remove(token);
    }
}
