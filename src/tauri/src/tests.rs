use crate::app_storage::AppStorage;
use crate::config_commands::{load_background, load_model, save_background, save_model};
use crate::history::SaveOptions;
use crate::json_store::{read_json, write_json};
use crate::session_commands::{load_history, save_history};
use crate::session_management;
use crate::sessions;
use atomic_write_file::AtomicWriteFile;
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("world-card-station-tauri-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn interrupted_atomic_write_keeps_previous_json() {
    let dir = TestDir::new();
    let path = dir.0.join("config/model.json");
    write_json(&path, &json!({ "modelName": "stable" })).unwrap();

    let mut pending = AtomicWriteFile::open(&path).unwrap();
    pending.write_all(br#"{"modelName":"partial"}"#).unwrap();
    drop(pending);

    let saved: Value = read_json(&path).unwrap().unwrap();
    assert_eq!(saved["modelName"], "stable");
}

#[tokio::test]
async fn configs_persist_and_concurrent_saves_keep_latest_value() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.clone());
    assert_eq!(load_model(&storage).await.unwrap()["modelName"], "");
    assert_eq!(
        load_background(&storage).await.unwrap()["backgroundOpacity"],
        0.5
    );

    let path = storage.model_config_path();
    let guard = storage.lock(&path).await;
    let first_storage = storage.clone();
    let first =
        tokio::spawn(
            async move { save_model(&first_storage, json!({ "modelName": "first" })).await },
        );
    tokio::task::yield_now().await;
    let latest_storage = storage.clone();
    let latest =
        tokio::spawn(
            async move { save_model(&latest_storage, json!({ "modelName": "latest" })).await },
        );
    tokio::task::yield_now().await;
    drop(guard);
    first.await.unwrap().unwrap();
    latest.await.unwrap().unwrap();
    save_background(
        &storage,
        json!({ "backgroundImageUrl": "", "backgroundOpacity": 0.7 }),
    )
    .await
    .unwrap();

    let restarted = AppStorage::new(dir.0.clone());
    assert_eq!(load_model(&restarted).await.unwrap()["modelName"], "latest");
    assert_eq!(
        load_background(&restarted).await.unwrap()["backgroundOpacity"],
        0.7
    );
}

#[tokio::test]
async fn sessions_persist_messages_state_retry_base_and_metadata() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.clone());
    save_history(
        &storage,
        json!([{ "role": "user", "content": "hello metadata" }]),
        SaveOptions {
            game_state: Some(json!({ "flags": { "met": true } })),
            retry_base_messages: Some(vec![json!({ "role": "user", "content": "retry" })]),
            retry_base_state: Some(json!({ "turn": 1 })),
            view_state: Some(json!({ "reading": { "messageId": "reply", "segmentIndex": 2 } })),
        },
    )
    .await
    .unwrap();

    let restarted = AppStorage::new(dir.0.clone());
    let history = load_history(&restarted).await.unwrap();
    assert_eq!(history["messages"][0]["content"], "hello metadata");
    assert_eq!(history["gameState"]["flags"]["met"], true);
    assert_eq!(history["retryBaseMessages"][0]["content"], "retry");
    assert_eq!(history["retryBaseState"]["turn"], 1);
    assert_eq!(history["viewState"]["reading"]["messageId"], "reply");

    let root = sessions::session_root(&restarted.game_cards_dir()).unwrap();
    let (items, active_id) = sessions::list(&root).unwrap();
    assert_eq!(active_id, "default");
    assert_eq!(items[0].message_count, 1);
    assert_eq!(items[0].preview, "hello metadata");
}

#[tokio::test]
async fn concurrent_session_saves_are_serialized_per_session() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.clone());
    let root = sessions::session_root(&storage.game_cards_dir()).unwrap();
    sessions::ensure(&root, "default", "默认会话").unwrap();
    let context = sessions::active_context(&root).unwrap();
    let guard = storage.lock(&context.dir).await;

    let first_storage = storage.clone();
    let first = tokio::spawn(async move {
        save_history(
            &first_storage,
            json!([{ "role": "user", "content": "first" }]),
            SaveOptions::default(),
        )
        .await
    });
    tokio::task::yield_now().await;
    let second_storage = storage.clone();
    let second = tokio::spawn(async move {
        save_history(
            &second_storage,
            json!([{ "role": "user", "content": "second" }]),
            SaveOptions::default(),
        )
        .await
    });
    tokio::task::yield_now().await;
    drop(guard);
    first.await.unwrap().unwrap();
    second.await.unwrap().unwrap();

    let history = load_history(&storage).await.unwrap();
    assert_eq!(history["messages"][0]["content"], "second");
}

#[tokio::test]
async fn session_management_and_card_scopes_persist() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.clone());
    let no_card_root = sessions::session_root(&storage.game_cards_dir()).unwrap();
    sessions::ensure(&no_card_root, "default", "默认会话").unwrap();
    let second = session_management::create(&no_card_root, "第二会话").unwrap();
    session_management::rename(&no_card_root, &second, "重命名会话").unwrap();
    session_management::set_active(&no_card_root, "default").unwrap();
    assert_eq!(
        session_management::delete(&no_card_root, &second).unwrap(),
        "default"
    );

    let cards_dir = storage.game_cards_dir();
    write_json(
        &cards_dir.join("cards/quest/card.json"),
        &json!({ "id": "quest" }),
    )
    .unwrap();
    write_json(&cards_dir.join("active.json"), &json!({ "id": "quest" })).unwrap();
    let card_root = sessions::session_root(&cards_dir).unwrap();
    assert!(card_root.ends_with("cards/quest/sessions"));
    assert_ne!(card_root, no_card_root);
    write_json(&cards_dir.join("active.json"), &json!({ "id": null })).unwrap();
    assert_eq!(sessions::session_root(&cards_dir).unwrap(), no_card_root);
}
