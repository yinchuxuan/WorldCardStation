#[path = "devkit_files.rs"]
mod files;

use files::{offline_markdown, read_tree, validate_links, write_bundle, Files};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::Path;

const SPEC_TOPICS: &[&str] = &[
    "schema",
    "actions",
    "predicates",
    "content",
    "imports",
    "state",
    "display",
    "display_templates",
    "audio",
    "visual",
    "visual_panel",
    "ui_runtime",
    "response_validation",
    "tavern_regex",
];

fn json_field(root: &Path, file: &str, field: &str) -> io::Result<String> {
    let value: Value = serde_json::from_slice(&fs::read(root.join(file))?)?;
    value[field]
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| io::Error::other(format!("devkit: missing {field} in {file}")))
}

pub fn collect(root: &Path, platform_version: &str) -> io::Result<Files> {
    let package_version = json_field(root, "package.json", "version")?;
    let client_version = json_field(root, "src/tauri/tauri.conf.json", "version")?;
    if package_version != platform_version || client_version != platform_version {
        return Err(io::Error::other(
            "devkit: platform version mismatch (Cargo/package/Tauri)",
        ));
    }
    let schema_version = json_field(
        root,
        "src/shared/game-card/schema/game-card.schema.json",
        "x-schema-version",
    )?;
    let mut bundle = Files::new();
    read_tree(&root.join("devkit"), "", &mut bundle)?;
    for relative in std::iter::once("game_card_design.md".to_string()).chain(
        SPEC_TOPICS
            .iter()
            .map(|topic| format!("game_card/game_card_{topic}.md")),
    ) {
        let source = fs::read_to_string(root.join("docs").join(&relative))?;
        bundle.insert(
            format!("spec/{relative}"),
            offline_markdown(&source)?.into_bytes(),
        );
    }

    let mut library = Files::new();
    read_tree(&root.join("libs/worldbook-library"), "", &mut library)?;
    if library
        .keys()
        .any(|name| !name.ends_with(".js") && !name.ends_with(".md"))
    {
        return Err(io::Error::other(
            "devkit: worldbook library must contain only scripts and docs",
        ));
    }
    let mut hash = Sha256::new();
    for (name, bytes) in &library {
        hash.update(name.as_bytes());
        hash.update([0]);
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    let library_version = format!("{:x}", hash.finalize());
    let readme = library
        .get_mut("README.md")
        .ok_or_else(|| io::Error::other("devkit: worldbook README missing"))?;
    let text = std::str::from_utf8(readme).map_err(io::Error::other)?;
    *readme = text
        .replacen(
            '\n',
            &format!("\n\n库版本：`sha256:{library_version}`；分发平台：{platform_version}。\n"),
            1,
        )
        .into_bytes();
    bundle.extend(
        library
            .into_iter()
            .map(|(path, content)| (format!("libs/worldbook-library/{path}"), content)),
    );
    for name in ["development.md", "libs.md"] {
        let content = bundle
            .get_mut(name)
            .ok_or_else(|| io::Error::other(format!("devkit: {name} missing")))?;
        *content = std::str::from_utf8(content)
            .map_err(io::Error::other)?
            .replace("{{DEVKIT_VERSION}}", platform_version)
            .replace("{{PLATFORM_VERSION}}", platform_version)
            .replace("{{SCHEMA_VERSION}}", &schema_version)
            .replace("{{WORLDBOOK_VERSION}}", &library_version)
            .into_bytes();
    }
    validate_links(&bundle)?;
    Ok(bundle)
}

pub fn generate(root: &Path, output: &Path, version: &str) -> io::Result<()> {
    let bundle = collect(root, version)?;
    write_bundle(output, &bundle)
}

#[cfg(test)]
#[path = "devkit_tests.rs"]
mod tests;
