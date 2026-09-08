use crate::tavern_input::prepare;
use crate::tavern_output::stage;
use crate::tavern_test_support::{character, input_file, plan, png, TestDir};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use std::fs;

#[test]
fn tavern_resources_are_local_bounded_and_missing_urls_stay_unresolved() {
    let dir = TestDir::new();
    let path = input_file(&dir.0);
    let mut source = character("v3");
    source["data"]["assets"] = json!([
        { "uri": "data:image/png;base64,YQ==" },
        { "uri": "data:text/javascript;base64,YQ==" },
        { "uri": "https://example.com/private.png" },
        { "uri": "file:///private.png" },
        { "uri": "embeded://missing.png" }
    ]);
    fs::write(&path, source.to_string()).unwrap();
    let input = prepare(&path, &dir.0).unwrap();
    assert_eq!(input.resources.len(), 1);
    assert_eq!(fs::read(&input.resources[0].path).unwrap(), b"a");
    let mut output = plan("test");
    output.copies.push(crate::tavern_output::CopyPlan {
        resource_id: "r0".into(),
        path: "assets/icon.png".into(),
    });
    stage(&input, &input.root.join("output"), output, "test").unwrap();
    assert_eq!(
        fs::read(input.root.join("output/assets/icon.png")).unwrap(),
        b"a"
    );
    source["data"]["assets"] = json!([{ "uri": "embeded://../escape" }]);
    fs::write(&path, source.to_string()).unwrap();
    assert!(prepare(&path, &dir.0).is_err());
}

#[test]
fn tavern_png_default_icon_and_library_provenance_ship_with_card() {
    let dir = TestDir::new();
    let path = dir.0.join("role.png");
    let text = [
        b"ccv3\0".as_slice(),
        STANDARD.encode(character("v3").to_string()).as_bytes(),
    ]
    .concat();
    fs::write(&path, png(&[(b"tEXt", text)])).unwrap();
    let input = prepare(&path, &dir.0).unwrap();
    assert_eq!(input.resources[0].uri, "ccdefault:");
    let mut output = plan("test");
    output.worldbook = true;
    output
        .files
        .insert("import/manifest.json".into(), "{}".into());
    let target = input.root.join("output");
    stage(&input, &target, output, "test").unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(target.join("import/manifest.json")).unwrap()).unwrap();
    assert_eq!(manifest["fingerprint"], input.fingerprint);
    assert_eq!(
        manifest["worldbookLibrarySha256"],
        crate::tavern_bundle::fingerprint()
    );
    assert!(target.join("lib/worldbook/README.md").is_file());
    assert!(target.join("lib/worldbook/SEMANTICS.md").is_file());
    assert!(target.join("lib/worldbook/index.js").is_file());
}

#[cfg(unix)]
#[test]
fn tavern_output_rechecks_resource_type_and_rejects_symlink_substitution() {
    let dir = TestDir::new();
    let path = input_file(&dir.0);
    let mut source = character("v3");
    source["data"]["assets"] = json!([{ "uri": "data:image/png;base64,YQ==" }]);
    fs::write(&path, source.to_string()).unwrap();
    let input = prepare(&path, &dir.0).unwrap();
    fs::remove_file(&input.resources[0].path).unwrap();
    std::os::unix::fs::symlink(&path, &input.resources[0].path).unwrap();
    let mut output = plan("test");
    output.copies.push(crate::tavern_output::CopyPlan {
        resource_id: "r0".into(),
        path: "assets/icon.png".into(),
    });
    assert!(stage(&input, &input.root.join("output"), output, "test").is_err());
}
