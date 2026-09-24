use crate::game_card_source_map::child_pointer;
use serde_json::Value;
use std::collections::HashSet;

const SCHEMA_TEXT: &str = include_str!("../../shared/game-card/schema/game-card.schema.json");

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct FileReference {
    pub field: String,
    pub file: String,
    pub pointer: String,
}

fn pointer<'a>(root: &'a Value, reference: &str) -> Option<&'a Value> {
    reference
        .strip_prefix("#/")?
        .split('/')
        .try_fold(root, |value, part| {
            value.get(part.replace("~1", "/").replace("~0", "~"))
        })
}

fn child_path(parent: &str, key: &str, index: bool) -> String {
    if index {
        format!("{parent}[{key}]")
    } else if parent.is_empty() {
        key.to_string()
    } else {
        format!("{parent}.{key}")
    }
}

fn walk(
    value: &Value,
    schema: &Value,
    root: &Value,
    path: &str,
    source: &str,
    files: &mut Vec<FileReference>,
) {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        if let Some(target) = pointer(root, reference) {
            walk(value, target, root, path, source, files);
        }
    }
    if schema.get("x-file").and_then(Value::as_bool) == Some(true) {
        if let Some(file) = value.as_str() {
            files.push(FileReference {
                field: path.to_string(),
                file: file.to_string(),
                pointer: source.to_string(),
            });
        }
    }
    for keyword in ["allOf", "anyOf", "oneOf"] {
        if let Some(branches) = schema.get(keyword).and_then(Value::as_array) {
            for branch in branches {
                walk(value, branch, root, path, source, files);
            }
        }
    }
    for keyword in ["then", "else"] {
        if let Some(branch) = schema.get(keyword) {
            walk(value, branch, root, path, source, files);
        }
    }
    if let Some(items) = value.as_array() {
        if let Some(item_schema) = schema.get("items") {
            for (index, item) in items.iter().enumerate() {
                walk(
                    item,
                    item_schema,
                    root,
                    &child_path(path, &index.to_string(), true),
                    &child_pointer(source, &index.to_string()),
                    files,
                );
            }
        }
        return;
    }
    let Some(object) = value.as_object() else {
        return;
    };
    let properties = schema.get("properties").and_then(Value::as_object);
    if let Some(properties) = properties {
        for (key, child_schema) in properties {
            if let Some(child) = object.get(key) {
                walk(
                    child,
                    child_schema,
                    root,
                    &child_path(path, key, false),
                    &child_pointer(source, key),
                    files,
                );
            }
        }
    }
    let Some(additional) = schema
        .get("additionalProperties")
        .filter(|item| item.is_object())
    else {
        return;
    };
    for (key, child) in object {
        if properties.is_some_and(|items| items.contains_key(key)) {
            continue;
        }
        walk(
            child,
            additional,
            root,
            &child_path(path, key, false),
            &child_pointer(source, key),
            files,
        );
    }
}

pub fn collect_file_references(card: &Value) -> Result<Vec<FileReference>, String> {
    let schema: Value = if card["formatVersion"] == "1" {
        crate::game_runtime_definition::definition_schema("runtimeManifest")
    } else {
        serde_json::from_str(SCHEMA_TEXT).map_err(|error| error.to_string())?
    };
    Ok(collect_schema_references(card, &schema))
}

pub(crate) fn collect_schema_references(card: &Value, schema: &Value) -> Vec<FileReference> {
    let mut files = Vec::new();
    walk(card, schema, schema, "", "", &mut files);
    let mut seen = HashSet::new();
    files.retain(|item| seen.insert(item.clone()));
    files
}
