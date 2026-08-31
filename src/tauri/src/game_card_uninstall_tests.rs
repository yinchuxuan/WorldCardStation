use crate::app_storage::AppStorage;
use crate::game_card_repository;
use crate::json_store::write_json;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("world-card-station-uninstall-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn uninstall_removes_card_sessions_and_active_selection() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let source = dir.0.join("source");
    fs::create_dir_all(&source).unwrap();
    write_json(
        &source.join("card.json"),
        &json!({ "version": "1", "id": "quest", "name": "Quest", "rules": [] }),
    )
    .unwrap();
    game_card_repository::import(&storage, &source)
        .await
        .unwrap();
    let card_root = storage.game_cards_dir().join("cards/quest");
    let save = card_root.join("sessions/default/messages.json");
    write_json(&save, &json!({ "messages": [{ "content": "save" }] })).unwrap();

    game_card_repository::delete(&storage, "quest")
        .await
        .unwrap();

    assert!(!card_root.exists());
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
    assert!(game_card_repository::list(&storage)
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn uninstall_rejects_missing_and_unsafe_cards() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    assert!(game_card_repository::delete(&storage, "missing")
        .await
        .unwrap_err()
        .error
        .contains("not found"));
    assert!(game_card_repository::delete(&storage, "../outside")
        .await
        .is_err());
}

#[tokio::test]
async fn uninstalling_an_inactive_card_keeps_the_active_card() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    for id in ["active", "other"] {
        game_card_repository::save(
            &storage,
            json!({ "version": "1", "id": id, "name": id, "rules": [] }),
        )
        .await
        .unwrap();
    }
    game_card_repository::set_active(&storage, Some("active"))
        .await
        .unwrap();

    game_card_repository::delete(&storage, "other")
        .await
        .unwrap();

    assert_eq!(
        game_card_repository::active(&storage)
            .await
            .unwrap()
            .unwrap()["id"],
        "active"
    );
}
