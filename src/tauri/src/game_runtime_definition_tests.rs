use crate::game_runtime_definition::load_definition;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn copy(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let destination = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy(&entry.path(), &destination);
        } else {
            fs::copy(entry.path(), destination).unwrap();
        }
    }
}

fn fixture() -> Fixture {
    let directory =
        Fixture(std::env::temp_dir().join(format!("wcs-runtime-{}", uuid::Uuid::new_v4())));
    copy(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/runtime-definition"),
        &directory.0,
    );
    directory
}

fn modify(root: &Path, case: &Value) {
    if let Some(file) = case["removeFile"].as_str() {
        fs::remove_file(root.join(file)).unwrap();
    }
    let Some(file) = case["file"].as_str() else {
        return;
    };
    let file = root.join(file);
    if let Some(raw) = case["raw"].as_str() {
        fs::write(file, raw).unwrap();
        return;
    }
    let mut value: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    let parts = case["path"].as_array().unwrap();
    let mut parent = &mut value;
    for part in &parts[..parts.len() - 1] {
        parent = match part.as_str() {
            Some(key) => &mut parent[key],
            None => &mut parent[part.as_u64().unwrap() as usize],
        };
    }
    let last = parts.last().unwrap();
    if let Some(key) = last.as_str() {
        if let Some(replacement) = case.get("value") {
            parent[key] = replacement.clone();
        } else {
            parent.as_object_mut().unwrap().remove(key);
        }
    } else {
        parent[last.as_u64().unwrap() as usize] = case["value"].clone();
    }
    fs::write(file, serde_json::to_string(&value).unwrap()).unwrap();
}

#[test]
fn runtime_definition_shared_js_rust_cases() {
    let cases: Value = serde_json::from_str(include_str!(
        "../../../test/fixtures/runtime-definition-cases.json"
    ))
    .unwrap();
    for case in cases.as_array().unwrap() {
        let root = fixture();
        modify(&root.0, case);
        let model_ids = case
            .get("modelIds")
            .map(|ids| serde_json::from_value(ids.clone()).unwrap())
            .unwrap_or(vec!["narration-model".to_string()]);
        let result = load_definition(&root.0, &model_ids);
        if case["valid"] == true {
            let definition = result.unwrap();
            assert_eq!(definition["formatVersion"], "1");
            assert_eq!(definition["main"]["path"], "main.js");
            assert!(definition["main"]["source"]
                .as_str()
                .unwrap()
                .contains("export async function onInput"));
            assert_eq!(definition["agents"].as_object().unwrap().len(), 2);
            assert_eq!(
                definition["agents"]["narrator"]["file"],
                "agents/narrator.json"
            );
            assert_eq!(definition["stateSchema"], serde_json::json!({}));
            assert!(crate::game_card_schema::validate_card(&definition["card"], &root.0).is_err());
        } else {
            let error = result.expect_err(case["name"].as_str().unwrap());
            assert!(
                error.contains(case["error"].as_str().unwrap()),
                "{}: {error}",
                case["name"]
            );
        }
    }
}

#[cfg(unix)]
#[test]
fn runtime_definition_rejects_symlink_escape() {
    let root = fixture();
    fs::remove_file(root.0.join("main.js")).unwrap();
    std::os::unix::fs::symlink(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"),
        root.0.join("main.js"),
    )
    .unwrap();
    assert!(load_definition(&root.0, &["narration-model".into()])
        .unwrap_err()
        .contains("main.js"));
}
