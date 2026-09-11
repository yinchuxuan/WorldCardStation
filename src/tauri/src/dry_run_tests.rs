use crate::developer_cli::{parse, Request};
use crate::dry_run::prepare;
use crate::dry_run_report::merge;
use crate::game_card_imports::read_card_with_sources;
use crate::game_card_source_map::locate;
use crate::tavern_test_support::TestDir;
use serde_json::{json, Value};
use std::fs;

fn card(root: &std::path::Path, rules: Value) {
    fs::write(
        root.join("card.json"),
        json!({ "id": "check", "name": "Check", "version": "1", "rules": rules }).to_string(),
    )
    .unwrap();
}

#[test]
fn dry_run_parser_has_one_exclusive_operation_and_preserves_native_paths() {
    assert_eq!(
        parse(vec!["--dry-run".into(), "中文 space".into()]).unwrap(),
        Some(Request::DryRun {
            target: "中文 space".into()
        })
    );
    for args in [
        vec!["--dry-run"],
        vec!["--dry-run", "a", "--dry-run", "b"],
        vec!["--dry-run", "a", "--lib", "worldbook"],
        vec!["--init-project", "a", "--dry-run", "b"],
    ] {
        assert_eq!(
            parse(args.into_iter().map(Into::into).collect())
                .unwrap_err()
                .code,
            "invalid_arguments"
        );
    }
    assert_eq!(parse(vec![]).unwrap(), None);
}

#[test]
fn dry_run_maps_flattened_imports_and_escaped_keys_back_to_original_sources() {
    let temp = TestDir::new();
    card(
        &temp.0,
        json!([{ "$import": "first.json" }, { "$import": "second.json" }]),
    );
    fs::write(
        temp.0.join("first.json"),
        r#"[{"when":{"phase":"init"},"then":[{"type":"insert","role":"system","content":"hi"}]}]"#,
    )
    .unwrap();
    fs::write(
        temp.0.join("second.json"),
        r#"[{"when":{"phase":"init"},"then":[{"$import":"action.json"}]}]"#,
    )
    .unwrap();
    fs::write(
        temp.0.join("action.json"),
        r#"{"type":"state.set","path":"data","value":{"a/b~c":1}}"#,
    )
    .unwrap();
    let expanded = read_card_with_sources(&temp.0).unwrap();
    let location = locate(&expanded.sources, "/rules/1/then/0/value/a~1b~0c");
    assert_eq!(location.file, "action.json");
    assert_eq!(location.pointer, "/value/a~1b~0c");
    let (mut report, prepared) = prepare(&temp.0);
    assert!(prepared.is_some(), "{report}");
    merge(
        &mut report,
        json!({ "diagnostics": [{ "code":"exec_syntax", "message":"bad", "pointer":"/rules/1/then/0/type" }], "warnings": [], "checked": ["javascript_syntax"] }),
        &expanded.sources,
    );
    assert_eq!(report["diagnostics"][0]["file"], "action.json");
    assert_eq!(report["diagnostics"][0]["pointer"], "/type");
    assert_eq!(report["status"], "invalid");
}

#[test]
fn dry_run_locates_imported_schema_errors_and_json_line_column() {
    let temp = TestDir::new();
    card(&temp.0, json!([{ "$import": "rules.json" }]));
    fs::write(
        temp.0.join("rules.json"),
        r#"[{"when":{"phase":"invalid"},"then":[{"type":"remove","predicate":{"all":true}}]}]"#,
    )
    .unwrap();
    let (report, prepared) = prepare(&temp.0);
    assert!(prepared.is_none());
    assert_eq!(report["diagnostics"][0]["file"], "rules.json");
    assert_eq!(report["diagnostics"][0]["pointer"], "/0/when/phase");
    fs::write(temp.0.join("rules.json"), "[\n invalid").unwrap();
    let (report, _) = prepare(&temp.0);
    assert_eq!(report["diagnostics"][0]["code"], "parse_json");
    assert_eq!(report["diagnostics"][0]["file"], "rules.json");
    assert_eq!(report["diagnostics"][0]["line"], 2);
    assert!(report["diagnostics"][0]["column"].as_u64().unwrap() > 0);
}

#[test]
fn dry_run_rejects_missing_escaping_circular_imports_and_missing_project_without_writes() {
    let temp = TestDir::new();
    for import in ["missing.json", "../outside.json", "card.json"] {
        card(&temp.0, json!([{ "$import": import }]));
        let before = fs::read(temp.0.join("card.json")).unwrap();
        let (report, prepared) = prepare(&temp.0);
        assert!(prepared.is_none());
        assert_eq!(report["diagnostics"][0]["code"], "expand_import");
        assert_eq!(report["diagnostics"][0]["pointer"], "/rules/0/$import");
        assert_eq!(fs::read(temp.0.join("card.json")).unwrap(), before);
        assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 1);
    }
    let (report, _) = prepare(&temp.0.join("missing"));
    assert_eq!(report["status"], "failed");
    assert_eq!(report["error"]["code"], "project_path");
    assert!(!temp.0.join("missing").exists());
}

#[test]
fn dry_run_reuses_declared_resource_and_external_state_schema_checks() {
    let temp = TestDir::new();
    fs::write(temp.0.join("card.json"), r#"{"id":"check","name":"Check","version":"1","rules":[],"files":{"$import":"files.json"}}"#).unwrap();
    fs::write(temp.0.join("files.json"), r#"{"a/b":"missing.md"}"#).unwrap();
    let (report, _) = prepare(&temp.0);
    assert_eq!(report["diagnostics"][0]["file"], "files.json");
    assert_eq!(report["diagnostics"][0]["pointer"], "/a~1b");
    fs::write(
        temp.0.join("card.json"),
        r#"{"id":"check","name":"Check","version":"1","rules":[],"stateSchema":"state.json"}"#,
    )
    .unwrap();
    fs::write(
        temp.0.join("state.json"),
        r#"{"hp":{"type":"number","default":"bad"}}"#,
    )
    .unwrap();
    let (report, _) = prepare(&temp.0);
    assert_eq!(report["diagnostics"][0]["file"], "state.json");
    assert_eq!(report["diagnostics"][0]["code"], "validate_state_schema");
    fs::write(
        temp.0.join("card.json"),
        r#"{"id":"../unsafe","name":"Check","version":"1","rules":[]}"#,
    )
    .unwrap();
    let (report, prepared) = prepare(&temp.0);
    assert!(prepared.is_none());
    assert_eq!(report["diagnostics"][0]["pointer"], "/id");
}

#[test]
fn dry_run_incomplete_checker_results_never_report_success() {
    let temp = TestDir::new();
    card(&temp.0, json!([]));
    for result in [
        json!({"failure":"timeout"}),
        json!({"diagnostics":[],"warnings":[]}),
    ] {
        let (mut report, _) = prepare(&temp.0);
        merge(&mut report, result, &Default::default());
        assert_eq!(report["status"], "failed");
        assert_eq!(report["ok"], false);
        assert!(!report["checked"]
            .as_array()
            .unwrap()
            .contains(&json!("javascript_syntax")));
    }
}

#[cfg(unix)]
#[test]
fn dry_run_cannot_read_imports_through_a_link_outside_the_project() {
    let temp = TestDir::new();
    let root = temp.0.join("project");
    fs::create_dir(&root).unwrap();
    fs::write(temp.0.join("outside.json"), "[]").unwrap();
    std::os::unix::fs::symlink(temp.0.join("outside.json"), root.join("link.json")).unwrap();
    card(&root, json!([{ "$import": "link.json" }]));
    let (report, prepared) = prepare(&root);
    assert!(prepared.is_none());
    assert!(report["diagnostics"][0]["message"]
        .as_str()
        .unwrap()
        .contains("inside"));
    assert_eq!(
        fs::read_to_string(temp.0.join("outside.json")).unwrap(),
        "[]"
    );
}
