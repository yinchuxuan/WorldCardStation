use crate::dry_run_report::{card_error, failure, merge, report};
use crate::game_card_error::{GameCardError, ValidationDetail};
use crate::game_card_imports::{read_card_with_sources, ExpandedCard};
use crate::game_card_paths::require_safe_id;
use crate::game_card_schema::validate_card;
use crate::game_card_source_map::SourceMap;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub struct PreparedCheck {
    pub root: PathBuf,
    pub expanded: ExpandedCard,
}

pub fn prepare(target: &Path) -> (Value, Option<PreparedCheck>) {
    let absolute = std::path::absolute(target).unwrap_or_else(|_| target.into());
    let mut result = report(&absolute);
    let root = match target.canonicalize() {
        Ok(root) if root.is_dir() && root.to_str().is_some() => root,
        _ => {
            failure(
                &mut result,
                "project_path",
                "项目目录不存在、不是目录或路径不是有效 UTF-8",
            );
            return (result, None);
        }
    };
    result["projectPath"] = json!(root);
    let expanded = match read_card_with_sources(&root) {
        Ok(expanded) => expanded,
        Err(error) => {
            card_error(&mut result, error, &SourceMap::new());
            return (result, None);
        }
    };
    result["checked"] = json!(["json", "imports"]);
    if let Err(error) = validate_card(&expanded.card, &root) {
        card_error(&mut result, error, &expanded.sources);
        return (result, None);
    }
    if let Err(error) = require_safe_id(expanded.card["id"].as_str().unwrap()) {
        let error = GameCardError::validation(
            error.error.clone(),
            "validate_card",
            Some("card.json"),
            vec![ValidationDetail::new(
                "card.json",
                error.error,
                Some("/id".into()),
            )],
        );
        card_error(&mut result, error, &expanded.sources);
        return (result, None);
    }
    result["checked"]
        .as_array_mut()
        .unwrap()
        .extend(["schema", "declared_resources", "state_schema"].map(Value::from));
    (result, Some(PreparedCheck { root, expanded }))
}

pub fn run(target: &Path, context: tauri::Context<tauri::Wry>) -> Value {
    let (mut report, prepared) = prepare(target);
    if let Some(prepared) = prepared {
        let sources = prepared.expanded.sources.clone();
        match crate::dry_run_host::check(prepared, context) {
            Ok(result) => merge(&mut report, result, &sources),
            Err(error) => failure(&mut report, "checker_failed", error),
        }
    }
    report
}
