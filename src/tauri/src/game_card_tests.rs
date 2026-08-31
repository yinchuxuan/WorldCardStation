use crate::app_storage::AppStorage;
use crate::game_card_imports::read_card;
use crate::game_card_repository;
use crate::game_card_schema::validate_card;
use crate::json_store::write_json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureCase {
    name: String,
    valid: bool,
    stage: Option<String>,
    error_includes: Option<String>,
}

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("world-card-station-card-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/game-card-import")
}

#[test]
fn shared_import_fixtures_match_declared_results() {
    let root = fixture_root();
    let cases: Vec<FixtureCase> =
        serde_json::from_str(&fs::read_to_string(root.join("manifest.json")).unwrap()).unwrap();
    for case in cases {
        let card_root = root.join(&case.name);
        let result = read_card(&card_root).and_then(|card| validate_card(&card, &card_root));
        assert_eq!(result.is_ok(), case.valid, "fixture {}", case.name);
        if let Err(error) = result {
            if let Some(stage) = case.stage {
                assert_eq!(
                    error.stage.as_deref(),
                    Some(stage.as_str()),
                    "fixture {}",
                    case.name
                );
            }
            if let Some(expected) = case.error_includes {
                assert!(
                    error.error.contains(&expected),
                    "fixture {}: {}",
                    case.name,
                    error.error
                );
            }
        }
    }
}

fn write_source(root: &Path, description: &str) {
    fs::create_dir_all(root).unwrap();
    write_json(
        &root.join("card.json"),
        &json!({
            "version": "1.0", "id": "quest", "name": "Quest",
            "description": description, "files": { "chapter": "chapter.md" }, "rules": []
        }),
    )
    .unwrap();
    fs::write(root.join("chapter.md"), description).unwrap();
}

#[tokio::test]
async fn repository_imports_overwrites_and_preserves_sessions() {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let first = dir.0.join("first");
    let second = dir.0.join("second");
    write_source(&first, "chapter one");
    write_source(&second, "chapter two");

    game_card_repository::import(&storage, &first)
        .await
        .unwrap();
    let session = storage
        .game_cards_dir()
        .join("cards/quest/sessions/default/messages.json");
    write_json(&session, &json!({ "messages": [{ "content": "save" }] })).unwrap();
    game_card_repository::import(&storage, &second)
        .await
        .unwrap();

    assert_eq!(
        game_card_repository::read_text(&storage, "quest", "chapter.md")
            .await
            .unwrap(),
        "chapter two"
    );
    assert_eq!(
        game_card_repository::active(&storage)
            .await
            .unwrap()
            .unwrap()["id"],
        "quest"
    );
    assert_eq!(game_card_repository::list(&storage).await.unwrap().len(), 1);
    let saved: Value = serde_json::from_str(&fs::read_to_string(session).unwrap()).unwrap();
    assert_eq!(saved["messages"][0]["content"], "save");

    game_card_repository::save(
        &storage,
        json!({ "version": "1.0", "id": "saved", "name": "Saved", "rules": [] }),
    )
    .await
    .unwrap();
    assert_eq!(
        game_card_repository::get(&storage, "saved")
            .await
            .unwrap()
            .unwrap()["name"],
        "Saved"
    );
    game_card_repository::set_active(&storage, Some("saved"))
        .await
        .unwrap();
    assert_eq!(
        game_card_repository::active(&storage)
            .await
            .unwrap()
            .unwrap()["id"],
        "saved"
    );
    game_card_repository::set_active(&storage, None)
        .await
        .unwrap();
    assert!(game_card_repository::active(&storage)
        .await
        .unwrap()
        .is_none());
}

#[test]
fn importer_rejects_excessive_depth() {
    let dir = TestDir::new();
    write_json(
        &dir.0.join("card.json"),
        &json!({ "$import": "imports/0.json" }),
    )
    .unwrap();
    for index in 0..20 {
        write_json(
            &dir.0.join(format!("imports/{index}.json")),
            &json!({ "$import": format!("imports/{}.json", index + 1) }),
        )
        .unwrap();
    }
    write_json(&dir.0.join("imports/20.json"), &json!({})).unwrap();

    let error = read_card(&dir.0).unwrap_err();
    assert!(error.error.contains("depth limit"));
}

#[cfg(unix)]
#[tokio::test]
async fn repository_rejects_symbolic_links() {
    use std::os::unix::fs::symlink;
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.join("data"));
    let source = dir.0.join("source");
    write_source(&source, "safe");
    fs::write(dir.0.join("secret.md"), "secret").unwrap();
    symlink(dir.0.join("secret.md"), source.join("escape.md")).unwrap();

    let error = game_card_repository::import(&storage, &source)
        .await
        .unwrap_err();
    assert!(error.error.contains("symbolic links"));
}

#[test]
fn white_album_card_expands_and_validates() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../game-card-examples/white-album-2");
    let card = read_card(&root).unwrap();
    validate_card(&card, &root).unwrap();
    assert!(card["files"]["plot.chapter.2"].is_string());
}
