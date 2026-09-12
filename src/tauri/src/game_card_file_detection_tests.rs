use super::*;

#[tokio::test]
async fn project_file_import_requires_card_json_and_tavern_updates_cannot_install_projects() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = dir.0.join("project");
    project(&root);
    let tasks = TavernTasks::default();
    assert!(tasks
        .prepare_file(&storage, &root.join("config/card.json"), false)
        .await
        .is_err());
    assert!(tasks
        .prepare_file(&storage, &root.join("card.json"), true)
        .await
        .unwrap_err()
        .error
        .contains("酒馆源文件"));
    fs::copy(root.join("card.json"), root.join("other.json")).unwrap();
    assert!(tasks
        .prepare_file(&storage, &root.join("other.json"), false)
        .await
        .is_err());
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
async fn project_file_import_keeps_explicit_tavern_specs_and_package_magic_authoritative() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = dir.0.join("project");
    project(&root);
    let entry = root.join("card.json");
    let tasks = TavernTasks::default();
    for version in ["v2", "v3"] {
        write_json(&entry, &character(version)).unwrap();
        for tavern_only in [false, true] {
            let preview = tasks
                .prepare_file(&storage, &entry, tavern_only)
                .await
                .unwrap();
            assert_eq!(preview["kind"], "tavern");
            assert_eq!(preview["container"], "json");
            tasks.cancel(preview["token"].as_str().unwrap()).await;
        }
    }
    for spec in [json!("unknown"), Value::Null] {
        let mut native = project(&root);
        native["spec"] = spec;
        write_json(&entry, &native).unwrap();
        assert!(tasks.prepare_file(&storage, &entry, false).await.is_err());
    }
    assert!(game_card_repository::list(&storage)
        .await
        .unwrap()
        .is_empty());
    let packaged = json!({ "id": "package", "version": "1", "name": "Package", "rules": [] });
    zip(&entry, &[("card.json", packaged.to_string().as_bytes())]);
    assert_eq!(
        tasks.prepare_file(&storage, &entry, false).await.unwrap(),
        packaged
    );
    assert!(!storage.game_cards_dir().join("cards/package/lib").exists());
}

#[cfg(unix)]
#[tokio::test]
async fn project_file_import_rejects_linked_entries_and_resources() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let root = dir.0.join("project");
    let card = project(&root);
    let outside = dir.0.join("outside.json");
    write_json(&outside, &card).unwrap();
    let entry = root.join("card.json");
    fs::remove_file(&entry).unwrap();
    std::os::unix::fs::symlink(&outside, &entry).unwrap();
    let tasks = TavernTasks::default();
    assert!(tasks.prepare_file(&storage, &entry, false).await.is_err());
    fs::remove_file(&entry).unwrap();
    project(&root);
    std::os::unix::fs::symlink(&outside, root.join("lib/linked.json")).unwrap();
    assert!(tasks.prepare_file(&storage, &entry, false).await.is_err());
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
    assert!(game_card_repository::list(&storage)
        .await
        .unwrap()
        .is_empty());
}
