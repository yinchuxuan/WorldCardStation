use crate::{
    app_storage::AppStorage,
    game_card_copy,
    game_card_imports::read_card,
    game_card_package::{export_package, ExportFormat},
    game_card_repository,
    json_store::{read_json, write_json},
    web_release::publish,
    web_release_protocol::{file, fingerprint, Release},
};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
#[path = "web_release_test_fixture.rs"]
mod fixture;
use fixture::Fixture;
#[path = "web_release_extra_tests.rs"]
mod extra;
#[test]
fn web_release_is_deterministic_complete_and_private_by_default() {
    let f = Fixture::new();
    for path in [
        "sessions/secret.json",
        ".wcs/settings.json",
        "trace/run.json",
        "settings.json",
        "notes.md",
        "worldbook/.env",
        "worldbook/sessions/save.md",
        "worldbook/notes.js",
    ] {
        let target = f.source.join(path);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, "PRIVATE").unwrap();
    }
    let first = f.publish();
    assert_eq!(first, f.publish());
    let paths: Vec<_> = first.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(
        paths,
        vec![
            "audio/tone.wav",
            "card.json",
            "images/cover.png",
            "images/outside.png",
            "scripts/helper.js",
            "scripts/main.js",
            "state.json",
            "ui/root.jsx",
            "ui/style.css",
            "worldbook/序章.md"
        ]
    );
    let release_root = f.release_dir(&first);
    assert_eq!(
        read_card(&release_root).unwrap(),
        read_card(&f.source).unwrap()
    );
    let loaded: Release = read_json(&release_root.join("release.json"))
        .unwrap()
        .unwrap();
    assert_eq!(loaded, first);
    for entry in &loaded.files {
        assert_eq!(*entry, file(&release_root, &entry.path).unwrap());
    }
    assert_eq!(fingerprint(&loaded.files), loaded.content_fingerprint);
    assert!(!release_root.join("sessions").exists());
    assert!(
        !String::from_utf8(fs::read(release_root.join("release.json")).unwrap())
            .unwrap()
            .contains(&f.root.to_string_lossy().to_string())
    );
}

#[tokio::test]
async fn web_release_identity_matches_desktop_directory_and_containers() {
    let f = Fixture::new();
    let first = f.publish();
    let storage = AppStorage::new(f.root.join("data"));
    for format in [ExportFormat::GameCard, ExportFormat::Png] {
        let (package, _) = export_package(
            &f.source,
            &f.root.join("packages"),
            format,
            Some(std::path::Path::new("images/cover.png")),
        )
        .unwrap();
        game_card_repository::import_file(&storage, &package)
            .await
            .unwrap();
        let installed = storage.game_cards_dir().join("cards/web-demo");
        let desktop = game_card_repository::get(&storage, "web-demo")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(desktop, read_card(&f.release_dir(&first)).unwrap());
        let republished = publish(&installed, &f.root.join("desktop-release"), None).unwrap();
        assert_eq!(first.content_fingerprint, republished.content_fingerprint);
    }
    let mut card = read_card(&f.source).unwrap();
    write_json(&f.source.join("card.json"), &card).unwrap();
    assert_eq!(f.publish().content_fingerprint, first.content_fingerprint);
    card["name"] = json!("改名");
    write_json(&f.source.join("card.json"), &card).unwrap();
    assert_ne!(f.publish().content_fingerprint, first.content_fingerprint);
    fs::write(
        f.source.join("scripts/helper.js"),
        "function initialCount() { return 2; }",
    )
    .unwrap();
    let updated = f.publish();
    assert_ne!(updated.content_fingerprint, first.content_fingerprint);
    assert!(f.release_dir(&first).is_dir());
}

#[test]
fn web_release_failure_preserves_index_and_never_overwrites_release() {
    let f = Fixture::new();
    let first = f.publish();
    let index = fs::read(f.output.join("index.json")).unwrap();
    fs::write(f.release_dir(&first).join("scripts/helper.js"), "tampered").unwrap();
    assert!(publish(&f.source, &f.output, Some("images/cover.png")).is_err());
    assert_eq!(fs::read(f.output.join("index.json")).unwrap(), index);
    assert_eq!(
        fs::read_to_string(f.release_dir(&first).join("scripts/helper.js")).unwrap(),
        "tampered"
    );
    fs::remove_file(f.source.join("scripts/helper.js")).unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
    assert_eq!(fs::read(f.output.join("index.json")).unwrap(), index);
    assert!(!fs::read_dir(&f.output).unwrap().any(|p| p
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with('.')));
}

#[test]
fn web_release_rejects_private_references_paths_and_cyclic_scripts() {
    let f = Fixture::new();
    let card = read_card(&f.source).unwrap();
    for path in [
        "../escape.md",
        "/absolute.md",
        "C:/private.md",
        "worldbook/%2e.md",
        "worldbook/./file.md",
        "sessions/save.md",
    ] {
        let mut value = card.clone();
        value["files"] = json!({"private": path});
        write_json(&f.source.join("card.json"), &value).unwrap();
        assert!(publish(&f.source, &f.output, None).is_err(), "{path}");
    }
    write_json(&f.source.join("card.json"), &card).unwrap();
    fs::write(f.source.join("scripts/helper.js"), "include('./main.js');").unwrap();
    assert!(publish(&f.source, &f.output, None)
        .unwrap_err()
        .error
        .contains("circular"));
    fs::create_dir_all(f.source.join("sessions")).unwrap();
    fs::write(f.source.join("sessions/rules.json"), "[]").unwrap();
    let mut card = card;
    card["rules"] = json!({"$import": "sessions/rules.json"});
    write_json(&f.source.join("card.json"), &card).unwrap();
    assert!(publish(&f.source, &f.output, None)
        .unwrap_err()
        .error
        .contains("Private"));
}

#[test]
fn web_release_rejects_unknown_catalog_and_concurrent_publisher() {
    let f = Fixture::new();
    fs::create_dir(&f.output).unwrap();
    fs::write(f.output.join(".publish.lock"), "occupied").unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
    assert!(f.output.join(".publish.lock").exists());
    fs::remove_file(f.output.join(".publish.lock")).unwrap();
    let value: Value = json!({"formatVersion": 99, "cards": []});
    write_json(&f.output.join("index.json"), &value).unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
    assert_eq!(
        read_json::<Value>(&f.output.join("index.json"))
            .unwrap()
            .unwrap(),
        value
    );
}

#[cfg(unix)]
#[test]
fn web_release_rejects_symlink_resources() {
    let f = Fixture::new();
    fs::remove_file(f.source.join("scripts/helper.js")).unwrap();
    std::os::unix::fs::symlink(
        f.source.join("scripts/main.js"),
        f.source.join("scripts/helper.js"),
    )
    .unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
}
