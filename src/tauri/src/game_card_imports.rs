use crate::game_card_error::{CardResult, GameCardError, ValidationDetail};
use crate::game_card_paths::{assert_safe_relative, existing_file};
use crate::game_card_source_map::{child_pointer, SourceLocation, SourceMap};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_IMPORT_DEPTH: usize = 20;

pub struct ExpandedCard {
    pub card: Value,
    pub sources: SourceMap,
}

fn import_path(value: &Value) -> Option<&str> {
    let object = value.as_object()?;
    if object.len() != 1 {
        return None;
    }
    object.get("$import")?.as_str()
}

fn located(error: GameCardError, stage: &str, source: &SourceLocation) -> GameCardError {
    GameCardError::validation(
        error.error.clone(),
        stage,
        Some(&source.file),
        vec![ValidationDetail::new(
            &source.file,
            error.error,
            Some(source.pointer.clone()),
        )],
    )
}

fn read_json(path: &Path, file: &str) -> CardResult<Value> {
    let content = fs::read_to_string(path).map_err(|error| {
        GameCardError::validation(
            format!("Failed to read {file}: {error}"),
            "read_json",
            Some(file),
            vec![],
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        let mut detail = ValidationDetail::new(file, error.to_string(), None);
        detail.line = Some(error.line());
        detail.column = Some(error.column());
        GameCardError::validation(
            format!("Failed to parse {file}: {error}"),
            "parse_json",
            Some(file),
            vec![detail],
        )
    })
}

fn append_sources(target: &mut SourceMap, sources: &SourceMap, from: &str, to: &str) {
    for (pointer, source) in sources {
        if pointer == from || pointer.starts_with(&format!("{from}/")) {
            target.insert(format!("{to}{}", &pointer[from.len()..]), source.clone());
        }
    }
}

fn expand(
    value: Value,
    root: &Path,
    stack: &[PathBuf],
    source: SourceLocation,
) -> CardResult<ExpandedCard> {
    if let Some(relative) = import_path(&value) {
        let reference = SourceLocation {
            file: source.file,
            pointer: child_pointer(&source.pointer, "$import"),
        };
        assert_safe_relative(relative, Some("json"))
            .map_err(|error| located(error, "expand_import", &reference))?;
        let path = existing_file(root, relative)
            .map_err(|error| located(error, "expand_import", &reference))?;
        if stack.contains(&path) {
            return Err(located(
                GameCardError::new(format!("circular game card import: {relative}")),
                "expand_import",
                &reference,
            ));
        }
        if stack.len() >= MAX_IMPORT_DEPTH {
            return Err(located(
                GameCardError::new("game card import depth limit exceeded"),
                "expand_import",
                &reference,
            ));
        }
        let mut next_stack = stack.to_vec();
        next_stack.push(path.clone());
        return expand(
            read_json(&path, relative)?,
            root,
            &next_stack,
            SourceLocation {
                file: relative.into(),
                pointer: String::new(),
            },
        );
    }
    let mut sources = SourceMap::from([(String::new(), source.clone())]);
    let card = match value {
        Value::Array(items) => {
            let mut output = Vec::new();
            for (index, item) in items.into_iter().enumerate() {
                let splice_import = import_path(&item).is_some();
                let child = expand(
                    item,
                    root,
                    stack,
                    SourceLocation {
                        file: source.file.clone(),
                        pointer: child_pointer(&source.pointer, &index.to_string()),
                    },
                )?;
                match child.card {
                    Value::Array(expanded) if splice_import => {
                        for (index, item) in expanded.into_iter().enumerate() {
                            append_sources(
                                &mut sources,
                                &child.sources,
                                &format!("/{index}"),
                                &format!("/{}", output.len()),
                            );
                            output.push(item);
                        }
                    }
                    expanded => {
                        append_sources(
                            &mut sources,
                            &child.sources,
                            "",
                            &format!("/{}", output.len()),
                        );
                        output.push(expanded);
                    }
                }
            }
            Value::Array(output)
        }
        Value::Object(items) => {
            let mut output = Map::new();
            for (key, value) in items {
                let child = expand(
                    value,
                    root,
                    stack,
                    SourceLocation {
                        file: source.file.clone(),
                        pointer: child_pointer(&source.pointer, &key),
                    },
                )?;
                append_sources(&mut sources, &child.sources, "", &child_pointer("", &key));
                output.insert(key, child.card);
            }
            Value::Object(output)
        }
        primitive => primitive,
    };
    Ok(ExpandedCard { card, sources })
}

pub fn read_card_with_sources(root: &Path) -> CardResult<ExpandedCard> {
    read_json_with_sources(root, "card.json")
}

pub fn read_json_with_sources(root: &Path, file: &str) -> CardResult<ExpandedCard> {
    let source = SourceLocation {
        file: file.into(),
        pointer: String::new(),
    };
    let path = existing_file(root, file).map_err(|error| located(error, "read_json", &source))?;
    expand(read_json(&path, file)?, root, &[path], source)
}

pub fn read_card(root: &Path) -> CardResult<Value> {
    read_card_with_sources(root).map(|expanded| expanded.card)
}
