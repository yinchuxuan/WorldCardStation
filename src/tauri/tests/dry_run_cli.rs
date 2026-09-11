use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

struct TestDir(PathBuf);
impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("wcs-dry-run-cli-{}", Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run(cwd: &Path, args: &[&str]) -> (i32, Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_world-card-station-tauri"))
        .current_dir(cwd)
        .env("PATH", "")
        .args(args)
        .output()
        .unwrap();
    let result = serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "invalid result: {error}; stdout={}; stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    });
    (output.status.code().unwrap(), result)
}

fn snapshot(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for entry in fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.extend(snapshot(&path));
        } else {
            files.insert(path.clone(), fs::read(&path).unwrap());
        }
    }
    files
}

#[test]
fn dry_run_cli_checks_initialized_worldbook_offline_and_does_not_modify_project_or_run_code() {
    let temp = TestDir::new();
    let (code, init) = run(
        &temp.0,
        &["--init-project", "游戏卡 project", "--lib", "worldbook"],
    );
    assert_eq!(code, 0, "{init}");
    let root = temp.0.join("游戏卡 project");
    let before = snapshot(&temp.0);
    let (code, result) = run(&temp.0, &["--dry-run", "游戏卡 project"]);
    assert_eq!(code, 0, "{result}");
    assert_eq!(result["operation"], "dry-run");
    assert_eq!(result["status"], "valid");
    assert!(result["checked"]
        .as_array()
        .unwrap()
        .contains(&json!("javascript_syntax")));
    assert_eq!(snapshot(&temp.0), before);
    assert!(!root.join("sessions").exists());
    let path = root.join("card.json");
    let mut card: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    card["rules"] = json!([{ "when": {"phase":"init"}, "then": [
        {"type":"exec", "sourceFile":"trap.js"},
        {"type":"exec", "source":"throw new Error('INLINE EXECUTED'); while(true) {}"}
    ]}]);
    fs::write(root.join("trap.js"), "throw new Error('TOP LEVEL EXECUTED'); while(true) {}\nfunction run() { throw new Error('RUN'); }").unwrap();
    fs::write(path, card.to_string()).unwrap();
    let before = snapshot(&temp.0);
    let (code, report) = run(&root, &["--dry-run", "."]);
    assert_eq!(code, 0, "{report}");
    assert_eq!(snapshot(&temp.0), before);
}

#[test]
fn dry_run_cli_reports_native_and_javascript_errors_at_original_files_with_distinct_exit_codes() {
    let temp = TestDir::new();
    let (code, help) = run(&temp.0, &["--help"]);
    assert_eq!(code, 0);
    assert!(help["commands"]
        .as_array()
        .unwrap()
        .contains(&json!("--dry-run")));
    for args in [
        vec!["--dry-run"],
        vec!["--dry-run", ".", "--lib", "worldbook"],
    ] {
        let (code, report) = run(&temp.0, &args);
        assert_eq!(code, 2, "{report}");
        assert_eq!(report["operation"], "dry-run");
    }
    let (code, report) = run(&temp.0, &["--dry-run", "missing"]);
    assert_eq!(code, 3, "{report}");
    assert_eq!(report["status"], "failed");
    fs::write(
        temp.0.join("card.json"),
        json!({"id":"check","name":"Check","version":"1","rules":[{"$import":"rules.json"}]})
            .to_string(),
    )
    .unwrap();
    fs::write(
        temp.0.join("rules.json"),
        r#"[{"when":{"phase":"bad"},"then":[{"type":"exec","source":"return {};"}]}]"#,
    )
    .unwrap();
    let (code, report) = run(&temp.0, &["--dry-run", "."]);
    assert_eq!(code, 1, "{report}");
    assert_eq!(report["diagnostics"][0]["file"], "rules.json");
    assert_eq!(report["diagnostics"][0]["pointer"], "/0/when/phase");
    fs::write(temp.0.join("rules.json"), r#"[{"when":{"phase":"init"},"then":[{"type":"exec","sourceFile":"main.js"},{"type":"insert","role":"system","content":"{{file:unknown}}"}]}]"#).unwrap();
    fs::write(
        temp.0.join("main.js"),
        "include('helper.js');\nfunction run() { return {}; }",
    )
    .unwrap();
    fs::write(temp.0.join("helper.js"), "const bad = ;").unwrap();
    let before = snapshot(&temp.0);
    let (code, report) = run(&temp.0, &["--dry-run", "."]);
    assert_eq!(code, 1, "{report}");
    let errors = report["diagnostics"].as_array().unwrap();
    assert!(errors
        .iter()
        .any(|item| item["code"] == "exec_syntax" && item["file"] == "helper.js"));
    assert!(errors.iter().any(|item| item["code"] == "file_reference"
        && item["file"] == "rules.json"
        && item["pointer"] == "/0/then/1/content"));
    assert_eq!(snapshot(&temp.0), before);
}
