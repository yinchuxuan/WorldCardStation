use crate::runtime_trace::RuntimeTrace;
use crate::runtime_trace_tests::{scope, snapshot, TestDir};
use crate::trace_files::{self, TraceScope};
use serde_json::json;
use std::fs;

#[tokio::test]
async fn trace_rejects_invalid_paths_and_preserves_truncated_logs() {
    let dir = TestDir::new();
    let root = dir.card();
    let trace = RuntimeTrace::default();
    let storage = dir.storage();
    for id in ["../outside", "/absolute", "", "a/b"] {
        let invalid = TraceScope {
            card_id: "test".into(),
            session_id: id.into(),
        };
        assert!(trace.start(&storage, invalid, snapshot()).await.is_err());
    }
    assert!(!root.join("sessions").exists());
    let opened = trace.start(&storage, scope(), snapshot()).await.unwrap();
    let path = opened["path"].as_str().unwrap();
    fs::write(path, b"{\"partial\"").unwrap();
    let error = trace
        .append(
            &storage,
            opened["token"].as_str().unwrap(),
            vec![json!({ "type": "next" })],
        )
        .await
        .unwrap_err();
    assert!(error.contains("incomplete"));
    assert_eq!(fs::read(path).unwrap(), b"{\"partial\"");
    assert!(trace.start(&storage, scope(), snapshot()).await.is_err());
}

#[test]
fn fingerprint_changes_with_scripts_but_not_session_logs_or_devkit() {
    let dir = TestDir::new();
    let root = dir.card();
    let before = trace_files::fingerprint(&root).unwrap();
    fs::create_dir_all(root.join("sessions")).unwrap();
    fs::write(root.join("sessions/trace.jsonl"), "private").unwrap();
    fs::create_dir_all(root.join(".wcs")).unwrap();
    fs::write(root.join(".wcs/development.md"), "guide").unwrap();
    assert_eq!(trace_files::fingerprint(&root).unwrap(), before);
    fs::write(root.join("main.js"), "function run() {}").unwrap();
    assert_ne!(trace_files::fingerprint(&root).unwrap(), before);
}

#[test]
fn directory_import_and_export_exclude_private_data_but_preserve_installed_sessions() {
    let dir = TestDir::new();
    let root = dir.card();
    for private in ["sessions", ".wcs", ".git"] {
        fs::create_dir_all(root.join(private)).unwrap();
        fs::write(root.join(private).join("private.txt"), "private").unwrap();
    }
    fs::create_dir_all(root.join("lib")).unwrap();
    fs::write(root.join("lib/README.md"), "library docs").unwrap();
    let staged = crate::game_card_copy::prepare(&root, &dir.0.join("staging")).unwrap();
    for private in ["sessions", ".wcs", ".git"] {
        assert!(!staged.join(private).exists());
    }
    assert!(staged.join("lib/README.md").is_file());
    crate::game_card_copy::preserve_sessions(&root, &staged).unwrap();
    assert_eq!(
        fs::read_to_string(staged.join("sessions/private.txt")).unwrap(),
        "private"
    );
    let archive = dir.0.join("export.zip");
    crate::game_card_archive::write_archive(&root, &archive).unwrap();
    let extracted = dir.0.join("extracted");
    crate::game_card_archive::extract_archive(&archive, &extracted).unwrap();
    for private in ["sessions", ".wcs", ".git"] {
        assert!(!extracted.join(private).exists());
    }
    assert!(extracted.join("lib/README.md").is_file());
}

#[cfg(unix)]
#[tokio::test]
async fn trace_cannot_follow_a_session_or_log_symlink() {
    let dir = TestDir::new();
    let root = dir.card();
    let trace = RuntimeTrace::default();
    let storage = dir.storage();
    let outside = dir.0.join("outside");
    fs::create_dir(&outside).unwrap();
    fs::create_dir(root.join("sessions")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join("sessions/default")).unwrap();
    assert!(trace.start(&storage, scope(), snapshot()).await.is_err());
    assert!(!outside.join("trace.jsonl").exists());
    fs::remove_file(root.join("sessions/default")).unwrap();
    fs::create_dir(root.join("sessions/default")).unwrap();
    let destination = outside.join("private.txt");
    fs::write(&destination, "unchanged").unwrap();
    std::os::unix::fs::symlink(&destination, root.join("sessions/default/trace.jsonl")).unwrap();
    assert!(trace.start(&storage, scope(), snapshot()).await.is_err());
    assert_eq!(fs::read_to_string(destination).unwrap(), "unchanged");
}
