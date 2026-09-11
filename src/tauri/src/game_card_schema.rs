use crate::game_card_error::{CardResult, GameCardError, ValidationDetail};
use crate::game_card_paths::{existing_directory, existing_file};
use crate::game_card_references::collect_file_references;
use crate::game_card_source_map::child_pointer;
use crate::game_card_state_schema::validate_state_schema;
use serde_json::Value;
use std::fs;
use std::path::Path;

const SCHEMA_TEXT: &str = include_str!("../../shared/game-card/schema/game-card.schema.json");

fn without_data_keywords(value: &mut Value) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(without_data_keywords),
        Value::Object(object) => {
            object.retain(|_, child| {
                !child
                    .as_object()
                    .is_some_and(|item| item.len() == 1 && item.contains_key("$data"))
            });
            object.values_mut().for_each(without_data_keywords);
        }
        _ => {}
    }
}

fn normalize_ecmascript_patterns(schema: &mut Value) {
    let matches = schema
        .pointer("/definitions/statePath/pattern")
        .and_then(Value::as_str)
        == Some(r"^[^.[\]]+(\.[^.[\]]+)*$");
    if matches {
        schema["definitions"]["statePath"]["pattern"] =
            Value::String(r"^[^.\[\]]+(\.[^.\[\]]+)*$".to_string());
    }
}

fn validate_structure(card: &Value) -> CardResult<()> {
    let mut schema: Value = serde_json::from_str(SCHEMA_TEXT).map_err(|error| {
        GameCardError::new(format!("Embedded game card schema is invalid: {error}"))
    })?;
    without_data_keywords(&mut schema);
    normalize_ecmascript_patterns(&mut schema);
    let validator = jsonschema::draft7::new(&schema).map_err(|error| {
        GameCardError::new(format!("Embedded game card schema is invalid: {error}"))
    })?;
    let details: Vec<_> = validator
        .iter_errors(card)
        .map(|error| {
            ValidationDetail::new(
                "card.json",
                format!("{}: {error}", error.instance_path()),
                Some(error.instance_path().to_string()),
            )
        })
        .collect();
    if details.is_empty() {
        Ok(())
    } else {
        Err(GameCardError::validation(
            "游戏卡主文件 schema 校验失败",
            "validate_card",
            Some("card.json"),
            details,
        ))
    }
}

fn collect_random_range_errors(value: &Value, path: &str, errors: &mut Vec<ValidationDetail>) {
    if let Some(object) = value.as_object() {
        if object.get("type").and_then(Value::as_str) == Some("state.randomInt") {
            let min = object.get("min").and_then(Value::as_i64);
            let max = object.get("max").and_then(Value::as_i64);
            if min.zip(max).is_some_and(|(min, max)| max < min) {
                errors.push(ValidationDetail::new(
                    "card.json",
                    format!("{path}/max: must be >= {}", min.unwrap()),
                    Some(child_pointer(path, "max")),
                ));
            }
        }
        for (key, child) in object {
            let next = child_pointer(path, key);
            collect_random_range_errors(child, &next, errors);
        }
    } else if let Some(items) = value.as_array() {
        for (index, child) in items.iter().enumerate() {
            collect_random_range_errors(child, &child_pointer(path, &index.to_string()), errors);
        }
    }
}

fn validate_data_constraints(card: &Value) -> CardResult<()> {
    let mut details = Vec::new();
    collect_random_range_errors(card, "", &mut details);
    if details.is_empty() {
        Ok(())
    } else {
        Err(GameCardError::validation(
            "游戏卡主文件 schema 校验失败",
            "validate_card",
            Some("card.json"),
            details,
        ))
    }
}

fn validate_files(card: &Value, root: &Path) -> CardResult<()> {
    let references = collect_file_references(card).map_err(GameCardError::new)?;
    let mut details: Vec<_> = references
        .into_iter()
        .filter_map(|reference| {
            existing_file(root, &reference.file).err().map(|error| {
                ValidationDetail::new(
                    "card.json",
                    format!(
                        "{}: {}: file not found or unsafe ({})",
                        reference.field, reference.file, error.error
                    ),
                    Some(reference.pointer),
                )
            })
        })
        .collect();
    if let Some(files) = card.get("files").and_then(Value::as_object) {
        for (id, value) in files {
            let Some(directory) = value.get("directory").and_then(Value::as_str) else {
                continue;
            };
            if existing_directory(root, directory).is_err() {
                details.push(ValidationDetail::new(
                    "card.json",
                    format!("files.{id}.directory: directory not found: {directory}"),
                    Some(child_pointer(&child_pointer("/files", id), "directory")),
                ));
            }
        }
    }
    if details.is_empty() {
        Ok(())
    } else {
        Err(GameCardError::validation(
            "游戏卡引用的资源文件不存在",
            "validate_files",
            None,
            details,
        ))
    }
}

fn validate_external_state(card: &Value, root: &Path) -> CardResult<()> {
    let Some(file) = card.get("stateSchema").and_then(Value::as_str) else {
        return Ok(());
    };
    let path = existing_file(root, file).map_err(|error| {
        GameCardError::validation(error.error, "load_state_schema", Some(file), Vec::new())
    })?;
    let value: Value = serde_json::from_str(
        &fs::read_to_string(path).map_err(GameCardError::from)?,
    )
    .map_err(|error| {
        GameCardError::validation(
            "state schema 文件无法读取或不是合法 JSON",
            "load_state_schema",
            Some(file),
            vec![ValidationDetail {
                line: Some(error.line()),
                column: Some(error.column()),
                ..ValidationDetail::new(file, error.to_string(), None)
            }],
        )
    })?;
    let details: Vec<_> = validate_state_schema(&value)
        .into_iter()
        .map(|message| ValidationDetail::new(file, message, None))
        .collect();
    if details.is_empty() {
        Ok(())
    } else {
        Err(GameCardError::validation(
            "游戏卡状态 schema 校验失败",
            "validate_state_schema",
            Some(file),
            details,
        ))
    }
}

pub fn validate_card(card: &Value, root: &Path) -> CardResult<()> {
    validate_structure(card)?;
    validate_data_constraints(card)?;
    validate_files(card, root)?;
    validate_external_state(card, root)
}
