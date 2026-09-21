use crate::project_init::initialize;
use crate::tavern_test_support::TestDir;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub fn devkit(temp: &TestDir) -> PathBuf {
    let path = temp.0.join("devkit");
    crate::devkit::generate(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."),
        &path,
        env!("CARGO_PKG_VERSION"),
    )
    .unwrap();
    path
}

#[test]
fn project_init_creates_unique_portable_minimal_cards_without_runtime_data() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let first = initialize(&kit, &temp.0.join("new/中文 空格"), &[]).unwrap();
    let second = initialize(&kit, &temp.0.join("another"), &[]).unwrap();
    assert_ne!(first.card_id, second.card_id);
    uuid::Uuid::parse_str(first.card_id.as_ref().unwrap()).unwrap();
    let root = PathBuf::from(&first.project_path);
    let card = crate::game_card_imports::read_card(&root).unwrap();
    crate::game_card_schema::validate_card(&card, &root).unwrap();
    assert!(PathBuf::from(first.guide_path).is_file());
    assert!(root.join(".wcs/spec/game_card/rules/actions.md").is_file());
    for name in [
        "lib",
        "worldbook",
        "sessions",
        "local.json",
        "devkit.json",
        ".git",
        "runs",
        "inputs",
    ] {
        assert!(!root.join(name).exists(), "{name}");
    }
    let moved = temp.0.join("moved");
    fs::rename(&root, &moved).unwrap();
    let again = initialize(&kit, &moved, &[]).unwrap();
    assert!(again.created.is_empty());
    assert_eq!(again.card_id, first.card_id);
}

#[test]
fn project_init_worldbook_installs_scripts_docs_config_and_existing_dsl_wiring() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    initialize(&kit, &root, &["worldbook".into()]).unwrap();
    let card = crate::game_card_imports::read_card(&root).unwrap();
    crate::game_card_schema::validate_card(&card, &root).unwrap();
    assert_eq!(card["files"]["worldbook"]["directory"], "worldbook");
    assert_eq!(
        card["rules"][1]["then"][0]["args"]["worldbook"],
        "worldbook"
    );
    assert_eq!(card["files"].as_object().unwrap().len(), 1);
    let config: Value =
        serde_json::from_slice(&fs::read(root.join("worldbook/config.json")).unwrap()).unwrap();
    assert_eq!(config["entries"], serde_json::json!([]));
    assert!(root.join("worldbook/entries").is_dir());
    for entry in fs::read_dir(kit.join("libs/worldbook-library/lib/worldbook")).unwrap() {
        let entry = entry.unwrap();
        assert_eq!(
            fs::read(entry.path()).unwrap(),
            fs::read(root.join("lib/worldbook").join(entry.file_name())).unwrap()
        );
    }
    for name in ["README.md", "SEMANTICS.md"] {
        assert_eq!(
            fs::read(kit.join("libs/worldbook-library").join(name)).unwrap(),
            fs::read(root.join("lib/worldbook").join(name)).unwrap()
        );
    }
}

#[test]
fn project_init_preserves_edited_card_library_docs_config_and_content_on_repeat() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    initialize(&kit, &root, &["worldbook".into()]).unwrap();
    let modified = [
        "card.json",
        ".wcs/development.md",
        "lib/worldbook/index.js",
        "worldbook/config.json",
        "worldbook/entries/自定义.md",
    ];
    for file in modified {
        fs::write(root.join(file), format!("edited {file}")).unwrap();
    }
    let result = initialize(&kit, &root, &["worldbook".into()]).unwrap();
    assert!(result.created.is_empty());
    for file in modified {
        assert_eq!(
            fs::read_to_string(root.join(file)).unwrap(),
            format!("edited {file}")
        );
    }
    assert!(result.preserved.contains(&"card.json".into()));
    assert!(result.preserved.contains(&"lib/worldbook/".into()));
}

#[test]
fn project_init_adds_support_to_existing_cards_without_rewriting_imports_or_rules() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("existing");
    fs::create_dir_all(root.join(".wcs")).unwrap();
    fs::write(root.join(".wcs/notes.md"), "user notes").unwrap();
    let original = "{\"id\":\"author-card\",\"rules\":[{\"$import\":\"unfinished.json\"}]}";
    fs::write(root.join("card.json"), original).unwrap();
    let result = initialize(&kit, &root, &["worldbook".into()]).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("card.json")).unwrap(),
        original
    );
    assert_eq!(result.card_id.as_deref(), Some("author-card"));
    assert!(PathBuf::from(result.guide_path).is_file());
    assert!(root.join("lib/worldbook/README.md").is_file());
    assert!(result
        .warnings
        .iter()
        .any(|warning| warning.contains("exec")));
    assert_eq!(
        fs::read_to_string(root.join(".wcs/notes.md")).unwrap(),
        "user notes"
    );
}

#[test]
fn project_init_preflight_rejects_conflicts_unknown_libraries_and_broken_devkits_without_writes() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    assert_eq!(
        initialize(&kit, &root, &["unknown".into()])
            .unwrap_err()
            .code,
        "unknown_library"
    );
    assert!(!root.exists());
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join(".wcs"), "not a directory").unwrap();
    assert_eq!(
        initialize(&kit, &root, &[]).unwrap_err().code,
        "path_conflict"
    );
    assert!(!root.join("card.json").exists());
    assert_eq!(
        fs::read_to_string(root.join(".wcs")).unwrap(),
        "not a directory"
    );
    fs::remove_file(kit.join("development.md")).unwrap();
    let other = temp.0.join("other");
    assert_eq!(
        initialize(&kit, &other, &[]).unwrap_err().code,
        "missing_devkit"
    );
    assert!(!other.exists());
}
