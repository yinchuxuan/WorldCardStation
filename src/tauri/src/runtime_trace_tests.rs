use crate::app_storage::AppStorage;
use crate::json_store::write_json;
use crate::runtime_trace::RuntimeTrace;
use crate::trace_files::TraceScope;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub(crate) struct TestDir(pub PathBuf);
impl TestDir {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!("wcs-trace-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    pub fn storage(&self) -> AppStorage {
        AppStorage::new(self.0.clone())
    }
    pub fn card(&self) -> PathBuf {
        let root = self.0.join("game-cards/cards/test");
        write_json(
            &root.join("card.json"),
            &json!({ "id": "test", "version": "1", "name": "Trace",
            "rules": [{ "$import": "rules.json" }] }),
        )
        .unwrap();
        write_json(
            &root.join("rules.json"),
            &json!([{ "when": { "phase": "init" }, "then": [] }]),
        )
        .unwrap();
        root
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
pub(crate) fn scope() -> TraceScope {
    TraceScope {
        card_id: "test".into(),
        session_id: "default".into(),
    }
}
pub(crate) fn snapshot() -> Value {
    json!({ "messages": [{ "role": "system", "content": "hidden" }], "state": { "score": 1 } })
}
pub(crate) fn records(path: &str) -> Vec<Value> {
    fs::read_to_string(path)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[tokio::test]
async fn trace_is_bound_to_origin_and_maps_imports_without_changing_history() {
    let dir = TestDir::new();
    let root = dir.card();
    let storage = dir.storage();
    let trace = RuntimeTrace::default();
    let history = root.join("sessions/default/messages.json");
    write_json(&history, &snapshot()).unwrap();
    let before = fs::read(&history).unwrap();
    let opened = trace.start(&storage, scope(), snapshot()).await.unwrap();
    let token = opened["token"].as_str().unwrap();
    write_json(
        &storage.game_cards_dir().join("active.json"),
        &json!({ "id": "another" }),
    )
    .unwrap();
    trace
        .append(
            &storage,
            token,
            vec![json!({ "type": "rule.start", "pointer": "/rules/0/when", "cardId": "forged" })],
        )
        .await
        .unwrap();
    let events = records(opened["path"].as_str().unwrap());
    assert_eq!(events[0]["snapshot"], snapshot());
    assert_eq!(events[0]["formatVersion"], 1);
    assert_eq!(events[0]["cardFingerprint"].as_str().unwrap().len(), 64);
    assert_eq!(events[1]["cardId"], "test");
    assert_eq!(events[1]["sessionId"], "default");
    assert_eq!(events[1]["sequence"], 1);
    assert_eq!(
        events[1]["source"],
        json!({ "file": "rules.json", "pointer": "/0/when" })
    );
    assert_eq!(fs::read(history).unwrap(), before);
    assert!(!storage.game_cards_dir().join("cards/another").exists());
    trace.close(token).await;
    assert!(trace
        .append(&storage, token, vec![json!({})])
        .await
        .is_err());
}

#[tokio::test]
async fn captures_append_and_deleted_sessions_are_not_recreated() {
    let dir = TestDir::new();
    let root = dir.card();
    let storage = dir.storage();
    let trace = RuntimeTrace::default();
    let first = trace.start(&storage, scope(), snapshot()).await.unwrap();
    trace.close(first["token"].as_str().unwrap()).await;
    let second = trace.start(&storage, scope(), snapshot()).await.unwrap();
    assert_eq!(records(second["path"].as_str().unwrap()).len(), 2);
    assert_ne!(first["token"], second["token"]);
    let session = root.join("sessions/default");
    fs::remove_dir_all(&session).unwrap();
    assert!(trace
        .append(&storage, second["token"].as_str().unwrap(), vec![json!({})])
        .await
        .is_err());
    assert!(!session.exists());
}

#[tokio::test]
async fn agent_trace_resolves_imports_in_the_agents_own_source_map() {
    let dir = TestDir::new();
    let root = dir.card();
    write_json(
        &root.join("card.json"),
        &json!({ "id": "test", "agents": { "judge": "agent.json" } }),
    )
    .unwrap();
    write_json(
        &root.join("agent.json"),
        &json!({ "rules": [{ "$import": "rules.json" }] }),
    )
    .unwrap();
    let trace = RuntimeTrace::default();
    let opened = trace
        .start(&dir.storage(), scope(), snapshot())
        .await
        .unwrap();
    trace.append(&dir.storage(), opened["token"].as_str().unwrap(), vec![json!({
        "type": "rule.start", "agentId": "judge", "callId": "one", "pointer": "/rules/0/when",
        "source": { "file": "forged.json", "pointer": "" }
    })]).await.unwrap();
    let events = records(opened["path"].as_str().unwrap());
    assert_eq!(
        events[1]["source"],
        json!({ "file": "rules.json", "pointer": "/0/when" })
    );
    assert_eq!(events[1]["callId"], "one");
}

#[tokio::test]
async fn concurrent_trace_batches_are_complete_jsonl_records() {
    let dir = TestDir::new();
    dir.card();
    let storage = dir.storage();
    let trace = RuntimeTrace::default();
    let opened = trace.start(&storage, scope(), snapshot()).await.unwrap();
    let token = opened["token"].as_str().unwrap();
    let (a, b) = tokio::join!(
        trace.append(&storage, token, vec![json!({ "type": "a" })]),
        trace.append(&storage, token, vec![json!({ "type": "b" })])
    );
    a.unwrap();
    b.unwrap();
    let events = records(opened["path"].as_str().unwrap());
    assert_eq!(events.len(), 3);
    assert_eq!(events[1]["sequence"], 1);
    assert_eq!(events[2]["sequence"], 2);
}
