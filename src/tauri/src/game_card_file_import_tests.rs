use crate::app_storage::AppStorage;
use crate::game_card_repository;
use crate::json_store::write_json;
use crate::tavern_tasks::TavernTasks;
use crate::tavern_test_support::{character, zip, TestDir};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

fn project(root: &Path) -> Value {
    let card = json!({ "id": "project", "name": "Project", "version": "1",
        "rules": [], "files": { "intro": "content/intro.md" } });
    write_json(
        &root.join("card.json"),
        &json!({ "$import": "config/card.json" }),
    )
    .unwrap();
    write_json(&root.join("config/card.json"), &card).unwrap();
    fs::create_dir_all(root.join("content")).unwrap();
    fs::write(root.join("content/intro.md"), "intro").unwrap();
    fs::create_dir_all(root.join("lib")).unwrap();
    fs::write(root.join("lib/run.js"), "function run(ctx) { return ctx; }").unwrap();
    card
}

#[tokio::test]
async fn project_file_import_copies_resources_skips_private_data_and_preserves_saves_on_update() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = dir.0.join("中文 Project");
    let mut card = project(&root);
    let entry = root.join("card.json");
    let original = fs::read(&entry).unwrap();
    for private in ["sessions", ".git", ".wcs"] {
        write_json(
            &root.join(private).join("private.json"),
            &json!({ "private": true }),
        )
        .unwrap();
    }
    let tasks = TavernTasks::default();
    assert_eq!(
        tasks.prepare_file(&storage, &entry, false).await.unwrap(),
        card
    );
    let installed = storage.game_cards_dir().join("cards/project");
    for file in [
        "card.json",
        "config/card.json",
        "content/intro.md",
        "lib/run.js",
    ] {
        assert_eq!(
            fs::read(installed.join(file)).unwrap(),
            fs::read(root.join(file)).unwrap()
        );
    }
    for private in ["sessions", ".git", ".wcs"] {
        assert!(!installed.join(private).exists());
        assert!(root.join(private).join("private.json").exists());
    }
    write_json(
        &installed.join("sessions/active.json"),
        &json!({ "id": "save" }),
    )
    .unwrap();
    let save = installed.join("sessions/save/messages.json");
    write_json(&save, &json!({ "messages": [{ "content": "saved" }] })).unwrap();
    let trace = installed.join("sessions/save/trace.jsonl");
    fs::write(&trace, "old trace\n").unwrap();
    let saved = fs::read(&save).unwrap();
    card["version"] = json!("2");
    write_json(&root.join("config/card.json"), &card).unwrap();
    fs::write(root.join("content/intro.md"), "updated").unwrap();
    assert_eq!(
        tasks.prepare_file(&storage, &entry, false).await.unwrap(),
        card
    );
    assert_eq!(fs::read(&save).unwrap(), saved);
    assert_eq!(fs::read_to_string(trace).unwrap(), "old trace\n");
    assert_eq!(
        fs::read_to_string(installed.join("content/intro.md")).unwrap(),
        "updated"
    );
    assert_eq!(fs::read(entry).unwrap(), original);
    assert_eq!(
        game_card_repository::active(&storage).await.unwrap(),
        Some(card)
    );
}

#[tokio::test]
async fn project_file_import_validation_failures_leave_installed_card_and_activation_unchanged() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = dir.0.join("project");
    let card = project(&root);
    let entry = root.join("card.json");
    let tasks = TavernTasks::default();
    tasks.prepare_file(&storage, &entry, false).await.unwrap();
    for invalid in [
        "{broken".to_owned(),
        json!({ "id": "project", "name": "Bad", "version": "2", "rules": "invalid" }).to_string(),
        json!({ "$import": "missing.json" }).to_string(),
        json!({ "$import": "../outside.json" }).to_string(),
        json!({ "$import": "card.json" }).to_string(),
    ] {
        fs::write(&entry, invalid).unwrap();
        assert!(tasks.prepare_file(&storage, &entry, false).await.is_err());
        assert_eq!(
            game_card_repository::active(&storage).await.unwrap(),
            Some(card.clone())
        );
        assert_eq!(
            fs::read_dir(storage.game_cards_dir().join("cards"))
                .unwrap()
                .count(),
            1
        );
    }
}

#[path = "game_card_file_detection_tests.rs"]
mod detection;
