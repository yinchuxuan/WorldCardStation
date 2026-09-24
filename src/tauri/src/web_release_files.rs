use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_paths::assert_safe_relative;
use crate::game_card_references::collect_file_references;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
pub fn safe_path(path: &str) -> CardResult<()> {
    assert_safe_relative(path, None)?;
    if path.chars().any(|c| c.is_control() || ":%?#".contains(c))
        || path
            .split('/')
            .any(|p| p == "." || p.ends_with('.') || p.ends_with(' '))
    {
        return Err(GameCardError::new(format!("Unsafe release path: {path}")));
    }
    Ok(())
}
pub fn private_path(path: &str) -> bool {
    path.split('/').any(|part| {
        let part = part.to_ascii_lowercase();
        part.starts_with('.')
            || matches!(
                part.as_str(),
                "sessions"
                    | "trace"
                    | "traces"
                    | "logs"
                    | "settings"
                    | "settings.json"
                    | "model-config.json"
                    | "node_modules"
                    | "__macosx"
                    | "target"
                    | "dist"
                    | "agents.md"
            )
    })
}

pub fn public_file(root: &Path, relative: &str) -> CardResult<PathBuf> {
    safe_path(relative)?;
    if private_path(relative) || relative == "release.json" {
        return Err(GameCardError::new(format!(
            "Private/reserved release path: {relative}"
        )));
    }
    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        path.push(part);
        if fs::symlink_metadata(&path)?.file_type().is_symlink() {
            return Err(GameCardError::new(format!("Symbolic link: {relative}")));
        }
    }
    if !path.is_file() {
        return Err(GameCardError::new(format!(
            "Not a release file: {relative}"
        )));
    }
    Ok(path)
}

fn matches(pattern: &str, value: &str) -> bool {
    match pattern.split_once('*') {
        None => pattern == value,
        Some((head, tail)) => value
            .strip_prefix(head)
            .and_then(|v| v.strip_suffix(tail))
            .is_some_and(|v| !v.contains('/')),
    }
}

fn scope_files(
    root: &Path,
    directory: &str,
    patterns: &[Value],
    paths: &mut BTreeSet<String>,
) -> CardResult<()> {
    safe_path(directory)?;
    if private_path(directory) {
        return Err(GameCardError::new("Private scope directory"));
    }
    // Inspect each component before traversing; never follow directory symlinks.
    let mut current = root.to_path_buf();
    for part in directory.split('/') {
        current.push(part);
        if fs::symlink_metadata(&current)?.file_type().is_symlink() {
            return Err(GameCardError::new("Symbolic link in scope"));
        }
    }
    fn walk(
        root: &Path,
        directory: &str,
        current: &str,
        patterns: &[Value],
        paths: &mut BTreeSet<String>,
    ) -> CardResult<()> {
        for entry in fs::read_dir(root.join(directory).join(current))? {
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| GameCardError::new("Non UTF-8 path"))?;
            let relative = if current.is_empty() {
                name
            } else {
                format!("{current}/{name}")
            };
            let full = format!("{directory}/{relative}");
            if private_path(&full) {
                continue;
            }
            let kind = entry.file_type()?;
            if kind.is_symlink() {
                return Err(GameCardError::new("Symbolic link in scope"));
            }
            if kind.is_dir() {
                walk(root, directory, &relative, patterns, paths)?;
            } else if patterns
                .iter()
                .any(|p| matches(p.as_str().unwrap_or(""), &relative))
            {
                public_file(root, &full)?;
                paths.insert(full);
            }
        }
        Ok(())
    }
    for pattern in patterns.iter().filter_map(Value::as_str) {
        safe_path(pattern)?;
        if !pattern.contains('*') {
            public_file(root, &format!("{directory}/{pattern}"))?;
        }
    }
    walk(root, directory, "", patterns, paths)
}

pub fn collect(root: &Path, card: &Value) -> CardResult<BTreeSet<String>> {
    let mut paths = BTreeSet::new();
    for item in collect_file_references(card).map_err(GameCardError::new)? {
        public_file(root, &item.file)?;
        paths.insert(item.file);
    }
    if card["formatVersion"] == "1" {
        for file in crate::game_runtime_definition::agent_files(root, card)? {
            public_file(root, &file)?;
            paths.insert(file);
        }
    }
    if let Some(files) = card["files"].as_object() {
        for scope in files.values().filter(|v| v.is_object()) {
            scope_files(
                root,
                scope["directory"].as_str().unwrap(),
                scope["include"].as_array().unwrap(),
                &mut paths,
            )?;
        }
    }
    let scripts: Vec<_> = paths.iter().filter(|p| p.ends_with(".js")).collect();
    if !scripts.is_empty() {
        let helper = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/publish-script-dependencies.mjs");
        let mut child = Command::new("node")
            .arg("--experimental-default-type=module")
            .arg(helper)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        child.stdin.take().unwrap().write_all(
            json!({"root": root, "scripts": scripts, "main": card.get("main")})
                .to_string()
                .as_bytes(),
        )?;
        let output = child.wait_with_output()?;
        if !output.status.success() {
            return Err(GameCardError::new(format!(
                "Script dependencies: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        let dependencies: Vec<String> = serde_json::from_slice(&output.stdout)
            .map_err(|e| GameCardError::new(e.to_string()))?;
        for dependency in dependencies {
            public_file(root, &dependency)?;
            paths.insert(dependency);
        }
    }
    let mut folded = BTreeSet::new();
    paths.insert("card.json".into());
    for path in &paths {
        if !folded.insert(path.to_lowercase()) {
            return Err(GameCardError::new("Case-colliding resource paths"));
        }
    }
    Ok(paths)
}
