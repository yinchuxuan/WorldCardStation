use crate::app_storage::AppStorage;
use crate::game_card_repository;
use crate::json_store::write_json;
use crate::tavern_tasks::TavernTasks;
use crate::tavern_test_support::{input_file, plan, TestDir};
use serde_json::json;
use std::fs;

#[tokio::test]
async fn tavern_update_picker_rejects_native_without_installation() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let native = dir.0.join("native.gamecard");
    let card = json!({ "id": "native", "name": "Native", "version": "1", "rules": [] });
    crate::tavern_test_support::zip(&native, &[("card.json", card.to_string().as_bytes())]);
    let tasks = TavernTasks::default();
    assert!(tasks.prepare_file(&storage, &native, true).await.is_err());
    assert!(game_card_repository::list(&storage)
        .await
        .unwrap()
        .is_empty());
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
    assert!(fs::read_dir(storage.game_cards_dir().join("cards"))
        .unwrap()
        .next()
        .is_none());
    let prepared = tasks
        .prepare_file(&storage, &input_file(&dir.0), true)
        .await
        .unwrap();
    assert_eq!(prepared["kind"], "tavern");
    tasks.cancel(prepared["token"].as_str().unwrap()).await;
    assert_eq!(
        tasks.prepare_file(&storage, &native, false).await.unwrap()["id"],
        "native"
    );
}

#[tokio::test]
async fn tavern_confirmation_cancel_revision_and_single_commit() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let tasks = TavernTasks::default();
    let prepared = tasks.prepare(&storage, &input_file(&dir.0)).await.unwrap();
    let token = prepared["token"].as_str().unwrap();
    let id = prepared["id"].as_str().unwrap();
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
    let first = tasks.stage(&storage, token, plan(id), None).await.unwrap();
    let second = tasks.stage(&storage, token, plan(id), None).await.unwrap();
    assert!(tasks
        .commit(&storage, token, first["revision"].as_str().unwrap())
        .await
        .is_err());
    let card = tasks
        .commit(&storage, token, second["revision"].as_str().unwrap())
        .await
        .unwrap();
    assert_eq!(card["id"], id);
    assert!(tasks
        .commit(&storage, token, second["revision"].as_str().unwrap())
        .await
        .is_err());
    assert_eq!(
        game_card_repository::active(&storage)
            .await
            .unwrap()
            .unwrap()["id"],
        id
    );
    let prepared = tasks.prepare(&storage, &input_file(&dir.0)).await.unwrap();
    let token = prepared["token"].as_str().unwrap();
    tasks.cancel(token).await;
    assert!(tasks.stage(&storage, token, plan(id), None).await.is_err());
    assert!(fs::read_dir(storage.game_cards_dir().join("cards"))
        .unwrap()
        .all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".tavern-")));
}

#[tokio::test]
async fn tavern_output_rejects_paths_unowned_resources_bad_schema_and_id() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let tasks = TavernTasks::default();
    let prepared = tasks.prepare(&storage, &input_file(&dir.0)).await.unwrap();
    let token = prepared["token"].as_str().unwrap();
    let id = prepared["id"].as_str().unwrap();
    for path in [
        "../escape",
        "./escape",
        "sessions/x",
        "C:/escape",
        "CARD.JSON",
        "name./x",
    ] {
        let mut output = plan(id);
        output.files.insert(path.into(), "x".into());
        assert!(
            tasks.stage(&storage, token, output, None).await.is_err(),
            "{path}"
        );
    }
    let mut output = plan(id);
    output.copies.push(crate::tavern_output::CopyPlan {
        resource_id: "unknown".into(),
        path: "assets/x.png".into(),
    });
    assert!(tasks.stage(&storage, token, output, None).await.is_err());
    assert!(tasks
        .stage(&storage, token, plan("wrong"), None)
        .await
        .is_err());
    let mut output = plan(id);
    output.files.insert(
        "card.json".into(),
        json!({ "id": id, "name": "x", "version": "1", "rules": [], "unknown": true }).to_string(),
    );
    assert!(tasks.stage(&storage, token, output, None).await.is_err());
    let mut output = plan(id);
    for index in 0..4096 {
        output
            .files
            .insert(format!("content/{index}.md"), "x".into());
    }
    assert!(tasks.stage(&storage, token, output, None).await.is_err());
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn tavern_explicit_update_preserves_sessions_and_activation_failure_restores_old_card() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = storage.game_cards_dir().join("cards/old");
    let old = json!({ "id": "old", "name": "Old", "version": "1", "rules": [] });
    write_json(&root.join("card.json"), &old).unwrap();
    write_json(
        &root.join("sessions/default/messages.json"),
        &json!({ "private": true }),
    )
    .unwrap();
    let tasks = TavernTasks::default();
    let prepared = tasks.prepare(&storage, &input_file(&dir.0)).await.unwrap();
    let token = prepared["token"].as_str().unwrap();
    let ready = tasks
        .stage(&storage, token, plan("old"), Some("old".into()))
        .await
        .unwrap();
    // Force active.json atomic replacement to fail, after the new directory is installed.
    fs::create_dir(storage.game_cards_dir().join("active.json")).unwrap();
    assert!(tasks
        .commit(&storage, token, ready["revision"].as_str().unwrap())
        .await
        .is_err());
    assert_eq!(
        game_card_repository::get(&storage, "old")
            .await
            .unwrap()
            .unwrap(),
        old
    );
    assert!(root.join("sessions/default/messages.json").exists());
    fs::remove_dir(storage.game_cards_dir().join("active.json")).unwrap();
    let prepared = tasks.prepare(&storage, &input_file(&dir.0)).await.unwrap();
    let token = prepared["token"].as_str().unwrap();
    let ready = tasks
        .stage(&storage, token, plan("old"), Some("old".into()))
        .await
        .unwrap();
    tasks
        .commit(&storage, token, ready["revision"].as_str().unwrap())
        .await
        .unwrap();
    assert!(root.join("sessions/default/messages.json").exists());
    assert_eq!(
        game_card_repository::active(&storage)
            .await
            .unwrap()
            .unwrap()["name"],
        "Converted"
    );
}
