use crate::game_card_schema::validate_card;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("wcs-directory-scope-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn card(directory: &str) -> serde_json::Value {
    json!({
        "version": "1", "id": "directory-card", "name": "Directory Card",
        "files": {
            "worldbook": {
                "directory": directory,
                "include": ["config.json", "entries/*.md"]
            }
        },
        "rules": []
    })
}

#[test]
fn validates_registered_text_directories() {
    let root = TestDir::new();
    fs::create_dir_all(root.0.join("worldbook/entries")).unwrap();
    validate_card(&card("worldbook"), &root.0).unwrap();

    let error = validate_card(&card("missing"), &root.0).unwrap_err();
    assert_eq!(error.stage.as_deref(), Some("validate_files"));
    assert!(error.details[0].message.contains("directory not found"));
}
