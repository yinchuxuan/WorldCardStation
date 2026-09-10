use super::{collect, files, generate};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("wcs-devkit-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn devkit_is_deterministic_versioned_and_contains_only_offline_resources() {
    let bundle = collect(&root(), env!("CARGO_PKG_VERSION")).unwrap();
    assert_eq!(bundle, collect(&root(), env!("CARGO_PKG_VERSION")).unwrap());
    let schema: serde_json::Value = serde_json::from_slice(
        &fs::read(root().join("src/shared/game-card/schema/game-card.schema.json")).unwrap(),
    )
    .unwrap();
    for name in ["development.md", "libs.md"] {
        let text = std::str::from_utf8(&bundle[name]).unwrap();
        assert!(text.contains(env!("CARGO_PKG_VERSION")));
        assert!(text.contains(schema["x-schema-version"].as_str().unwrap()));
        assert!(!text.contains("{{"));
        assert!(!text.contains(&root().display().to_string()));
    }
    for (name, bytes) in &bundle {
        assert!(
            name.ends_with(".md") || name.ends_with(".js") || name == "templates/minimal/card.json"
        );
        assert!(
            std::str::from_utf8(bytes).unwrap().lines().count() <= 200,
            "{name}"
        );
        assert!(!name.contains("sessions/") && !name.contains("SKILL.md"));
        assert!(!name.contains("game-card.schema.json"));
    }
    assert!(collect(&root(), "not-the-platform-version").is_err());
}

#[test]
fn devkit_library_scripts_match_the_canonical_library_and_ship_with_docs() {
    let bundle = collect(&root(), env!("CARGO_PKG_VERSION")).unwrap();
    let mut library = files::Files::new();
    files::read_tree(&root().join("libs/worldbook-library"), "", &mut library).unwrap();
    for (name, bytes) in &library {
        let bundled = &bundle[&format!("libs/worldbook-library/{name}")];
        if name != "README.md" {
            assert_eq!(bundled, bytes, "{name}");
        }
    }
    let index = std::str::from_utf8(&bundle["libs.md"]).unwrap();
    let version = index
        .split("sha256:")
        .nth(1)
        .unwrap()
        .split('`')
        .next()
        .unwrap();
    assert_eq!(version.len(), 64);
    let readme = std::str::from_utf8(&bundle["libs/worldbook-library/README.md"]).unwrap();
    assert!(readme.contains(version));
    assert!(bundle.contains_key("libs/worldbook-library/SEMANTICS.md"));
    assert!(!bundle
        .keys()
        .any(|name| name.starts_with("templates/minimal/lib/")));
}

#[test]
fn devkit_docs_and_selected_library_keep_working_after_project_relocation() {
    let bundle = collect(&root(), env!("CARGO_PKG_VERSION")).unwrap();
    let project: files::Files = bundle
        .into_iter()
        .filter_map(|(path, content)| {
            if path == "development.md" || path == "libs.md" || path.starts_with("spec/") {
                return Some((format!(".wcs/{path}"), content));
            }
            let relative = path.strip_prefix("libs/worldbook-library/")?;
            let target = if relative.starts_with("lib/") {
                relative.to_string()
            } else {
                format!("lib/worldbook/{relative}")
            };
            Some((target, content))
        })
        .collect();
    files::validate_links(&project).unwrap();
    let temp = TestDir::new();
    files::write_bundle(&temp.0.join("original"), &project).unwrap();
    fs::rename(temp.0.join("original"), temp.0.join("relocated")).unwrap();
    let mut relocated = files::Files::new();
    files::read_tree(&temp.0.join("relocated"), "", &mut relocated).unwrap();
    assert_eq!(relocated, project);
    files::validate_links(&relocated).unwrap();
}

#[test]
fn devkit_minimal_template_passes_the_real_platform_loader_and_validator() {
    let temp = TestDir::new();
    generate(&root(), &temp.0, env!("CARGO_PKG_VERSION")).unwrap();
    let template = temp.0.join("templates/minimal");
    let mut card = crate::game_card_imports::read_card(&template).unwrap();
    assert_eq!(card["id"], "REPLACE_WITH_NEW_UUID");
    crate::game_card_schema::validate_card(&card, &template).unwrap();
    card["id"] = Uuid::new_v4().to_string().into();
    crate::game_card_schema::validate_card(&card, &template).unwrap();
    assert!(!card["rules"].as_array().unwrap().is_empty());
}

#[test]
fn devkit_regeneration_removes_stale_outputs_without_rewriting_unchanged_files() {
    let temp = TestDir::new();
    generate(&root(), &temp.0, env!("CARGO_PKG_VERSION")).unwrap();
    let path = temp.0.join("development.md");
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    fs::write(temp.0.join("obsolete.md"), "obsolete").unwrap();
    generate(&root(), &temp.0, env!("CARGO_PKG_VERSION")).unwrap();
    assert!(!temp.0.join("obsolete.md").exists());
    assert_eq!(modified, fs::metadata(&path).unwrap().modified().unwrap());
}

#[test]
fn devkit_rejects_broken_or_escaping_document_links_and_bad_omission_markers() {
    for link in ["missing.md", "../outside.md", "/absolute.md"] {
        let docs = [("README.md".into(), format!("[bad]({link})").into_bytes())].into();
        assert!(files::validate_links(&docs).is_err());
    }
    for content in [
        "<!-- devkit:omit:start -->",
        "<!-- devkit:omit:end -->",
        "<!-- devkit:omit:start -->\n<!-- devkit:omit:start -->",
    ] {
        assert!(files::offline_markdown(content).is_err());
    }
    assert_eq!(
        files::offline_markdown(
            "keep\n<!-- devkit:omit:start -->\nomit\n<!-- devkit:omit:end -->\nend"
        )
        .unwrap(),
        "keep\nend\n"
    );
}

#[test]
fn devkit_is_mapped_to_the_same_resource_directory_in_desktop_bundles() {
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root().join("src/tauri/tauri.conf.json")).unwrap())
            .unwrap();
    assert_eq!(
        config["bundle"]["resources"]["../../dist/devkit/"],
        "devkit/"
    );
    for platform in ["macos", "windows", "linux", "e2e"] {
        let config: serde_json::Value = serde_json::from_slice(
            &fs::read(root().join(format!("src/tauri/tauri.{platform}.conf.json"))).unwrap(),
        )
        .unwrap();
        assert!(config["bundle"].get("resources").is_none());
    }
}
