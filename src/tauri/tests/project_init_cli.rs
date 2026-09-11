use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use uuid::Uuid;

struct TestDir(PathBuf);
impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("wcs-init-cli-{}", Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run(cwd: &Path, args: &[&str]) -> (Output, Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_world-card-station-tauri"))
        .current_dir(cwd)
        .env("PATH", "")
        .args(args)
        .output()
        .unwrap();
    let value = serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "invalid JSON output: {error}; stdout={}; stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    });
    (output, value)
}

#[test]
fn project_init_cli_works_outside_the_repository_without_node_or_a_window() {
    let temp = TestDir::new();
    let (output, result) = run(
        &temp.0,
        &["--init-project", "新项目 with spaces", "--lib", "worldbook"],
    );
    assert!(output.status.success(), "{result}");
    assert_eq!(result["ok"], true);
    assert_eq!(result["operation"], "init-project");
    assert!(result["created"]
        .as_array()
        .unwrap()
        .contains(&Value::from("card.json")));
    assert!(Path::new(result["guidePath"].as_str().unwrap()).is_file());
    let root = temp.0.join("新项目 with spaces");
    assert!(root.join("lib/worldbook/SEMANTICS.md").is_file());
    assert!(!root.join("sessions").exists());
    let before = fs::read(root.join("card.json")).unwrap();
    let (again, report) = run(
        &temp.0,
        &["--init-project", "新项目 with spaces", "--lib", "worldbook"],
    );
    assert!(again.status.success());
    assert_eq!(report["cardId"], result["cardId"]);
    assert_eq!(report["created"], serde_json::json!([]));
    assert_eq!(fs::read(root.join("card.json")).unwrap(), before);
}

#[test]
fn project_init_cli_reports_help_and_rejects_invalid_commands_with_json_exit_status() {
    let temp = TestDir::new();
    let (output, help) = run(&temp.0, &["--help"]);
    assert!(output.status.success());
    assert!(Path::new(help["devkitPath"].as_str().unwrap()).is_dir());
    for args in [
        vec!["--init-project"],
        vec!["--lib", "worldbook"],
        vec!["--dry-run"],
        vec!["--init-project", "new", "--lib", "unknown"],
        vec!["--init-project", "a", "--init-project", "b"],
    ] {
        let (output, error) = run(&temp.0, &args);
        assert_eq!(output.status.code(), Some(2), "{error}");
        assert_eq!(error["ok"], false);
        assert!(error["error"]["code"].is_string());
    }
    assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 0);
    fs::write(temp.0.join("not-directory"), "existing data").unwrap();
    let (output, error) = run(&temp.0, &["--init-project", "not-directory"]);
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(error["error"]["code"], "path_conflict");
    assert_eq!(
        fs::read_to_string(temp.0.join("not-directory")).unwrap(),
        "existing data"
    );
}
