use crate::project_init::initialize;
use crate::project_init_error::InitError;
use crate::project_init_tests::devkit;
use crate::project_init_write::Writer;
use crate::tavern_test_support::TestDir;
use std::fs;

#[test]
fn project_init_rollback_removes_only_its_own_unchanged_files_and_empty_directories() {
    let temp = TestDir::new();
    let root = temp.0.canonicalize().unwrap().join("nested/card");
    let mut writer = Writer::new(&root);
    writer
        .file(".wcs/development.md", b"original guide")
        .unwrap();
    writer.file("lib/owned.js", b"owned").unwrap();
    fs::write(root.join(".wcs/development.md"), "user changed the guide").unwrap();
    fs::write(root.join("lib/user.js"), "user added this").unwrap();
    let mut error = InitError::new("test_failure", "injected write failure");
    writer.rollback(&mut error);
    assert!(!root.join("lib/owned.js").exists());
    assert_eq!(
        fs::read_to_string(root.join(".wcs/development.md")).unwrap(),
        "user changed the guide"
    );
    assert_eq!(
        fs::read_to_string(root.join("lib/user.js")).unwrap(),
        "user added this"
    );
    assert!(error
        .retained_paths
        .iter()
        .any(|path| path.ends_with("development.md")));
    let clean = temp.0.canonicalize().unwrap().join("clean/nested/card");
    let mut writer = Writer::new(&clean);
    writer.file(".wcs/development.md", b"guide").unwrap();
    writer.rollback(&mut InitError::new("test", "test"));
    assert!(!temp.0.join("clean").exists());
}

#[test]
fn project_init_writer_rejects_concurrent_destination_creation_without_overwriting_it() {
    let temp = TestDir::new();
    let root = temp.0.canonicalize().unwrap();
    let mut writer = Writer::new(&root);
    writer.file("created.md", b"new").unwrap();
    fs::write(root.join("conflict.md"), "concurrent edit").unwrap();
    let mut error = writer.file("conflict.md", b"replacement").unwrap_err();
    assert_eq!(error.code, "concurrent_change");
    writer.rollback(&mut error);
    assert_eq!(
        fs::read_to_string(root.join("conflict.md")).unwrap(),
        "concurrent edit"
    );
    assert!(!root.join("created.md").exists());
}

#[test]
fn project_init_preserves_partial_library_snapshots_instead_of_mixing_versions() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    fs::create_dir_all(root.join("lib/worldbook")).unwrap();
    fs::write(root.join("card.json"), "{}").unwrap();
    fs::write(root.join("lib/worldbook/index.js"), "custom old version").unwrap();
    let report = initialize(&kit, &root, &["worldbook".into()]).unwrap();
    assert!(!root.join("lib/worldbook/normalize.js").exists());
    assert!(!report.warnings.is_empty());
    assert_eq!(
        fs::read_to_string(root.join("lib/worldbook/index.js")).unwrap(),
        "custom old version"
    );
}

#[test]
fn project_init_respects_other_initializations_and_cleans_its_lock_on_success() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    fs::create_dir(&root).unwrap();
    fs::write(root.join(".wcs-init.lock"), "another process").unwrap();
    assert_eq!(
        initialize(&kit, &root, &[]).unwrap_err().code,
        "project_busy"
    );
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(
        fs::read_to_string(root.join(".wcs-init.lock")).unwrap(),
        "another process"
    );
    fs::remove_file(root.join(".wcs-init.lock")).unwrap();
    initialize(&kit, &root, &[]).unwrap();
    assert!(!root.join(".wcs-init.lock").exists());
}

#[test]
fn project_init_rejects_partial_docs_without_an_entrypoint_before_any_writes() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let root = temp.0.join("card");
    fs::create_dir_all(root.join(".wcs")).unwrap();
    fs::write(root.join(".wcs/libs.md"), "existing partial docs").unwrap();
    assert_eq!(
        initialize(&kit, &root, &[]).unwrap_err().code,
        "path_conflict"
    );
    assert!(!root.join("card.json").exists());
    assert!(!root.join(".wcs-init.lock").exists());
    assert_eq!(
        fs::read_to_string(root.join(".wcs/libs.md")).unwrap(),
        "existing partial docs"
    );
}

#[cfg(unix)]
#[test]
fn project_init_rejects_linked_targets_directories_files_and_dangling_links() {
    use std::os::unix::fs::symlink;
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let outside = temp.0.join("outside");
    fs::create_dir(&outside).unwrap();
    let linked = temp.0.join("linked");
    symlink(&outside, &linked).unwrap();
    assert_eq!(
        initialize(&kit, &linked, &[]).unwrap_err().code,
        "unsafe_path"
    );
    assert_eq!(
        initialize(&kit, &linked.join("new"), &[]).unwrap_err().code,
        "unsafe_path"
    );
    for (index, target) in [".wcs", "card.json", ".wcs/development.md"]
        .iter()
        .enumerate()
    {
        let root = temp.0.join(format!("card-{index}"));
        fs::create_dir_all(root.join(target).parent().unwrap()).unwrap();
        symlink(outside.join("missing"), root.join(target)).unwrap();
        assert_eq!(
            initialize(&kit, &root, &[]).unwrap_err().code,
            "unsafe_path"
        );
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
    }
}

#[cfg(unix)]
#[test]
fn project_init_rechecks_directory_links_before_writing_after_preflight() {
    use std::os::unix::fs::symlink;
    let temp = TestDir::new();
    let root = temp.0.canonicalize().unwrap().join("card");
    let outside = temp.0.join("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir(&outside).unwrap();
    let mut writer = Writer::new(&root);
    writer.file("owned.md", b"owned").unwrap();
    symlink(&outside, root.join(".wcs")).unwrap();
    let mut error = writer
        .file(".wcs/development.md", b"must not escape")
        .unwrap_err();
    writer.rollback(&mut error);
    assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
    assert!(!root.join("owned.md").exists());
}
