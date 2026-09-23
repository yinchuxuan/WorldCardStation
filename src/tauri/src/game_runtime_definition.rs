//! Internal protocol loading boundary. Not exposed through a player command yet.
use crate::game_card_paths::{existing_directory, existing_file};
use crate::game_card_references::collect_schema_references;
use crate::game_card_schema::{
    normalize_ecmascript_patterns, validate_data_constraints, without_data_keywords,
};
use crate::game_card_state_schema::validate_state_schema;
use serde_json::{json, Value};
use std::{fs, path::Path};

const SCHEMA: &str = include_str!("../../shared/game-card/schema/game-card.schema.json");
#[path = "game_runtime_definition_tests.rs"]
mod tests;

fn definition_schema(kind: &str) -> Value {
    let mut source: Value = serde_json::from_str(SCHEMA).unwrap();
    let overrides = source["x-runtime-overrides"].as_array().unwrap().clone();
    for item in overrides {
        let path = item["path"].as_array().unwrap();
        let mut parent = &mut source["definitions"];
        for key in &path[..path.len() - 1] {
            parent = &mut parent[key.as_str().unwrap()];
        }
        parent[path.last().unwrap().as_str().unwrap()] = item["schema"].clone();
    }
    json!({"$ref": format!("#/definitions/{kind}"), "definitions": source["definitions"]})
}

fn read(root: &Path, file: &str) -> Result<String, String> {
    let path = existing_file(root, file).map_err(|e| format!("{file}: {}", e.error))?;
    fs::read_to_string(path).map_err(|e| format!("{file}: {e}"))
}

fn read_json(root: &Path, file: &str) -> Result<Value, String> {
    serde_json::from_str(&read(root, file)?).map_err(|e| format!("{file}: invalid JSON: {e}"))
}

fn validate(root: &Path, value: &Value, kind: &str, file: &str) -> Result<(), String> {
    let schema = definition_schema(kind);
    let mut native = schema.clone();
    without_data_keywords(&mut native);
    normalize_ecmascript_patterns(&mut native);
    let validator = jsonschema::draft7::new(&native).map_err(|e| e.to_string())?;
    if let Some(error) = validator.iter_errors(value).next() {
        return Err(format!("{file}: {}: {error}", error.instance_path()));
    }
    validate_data_constraints(value).map_err(|e| format!("{file}: {:?}", e.details))?;
    for reference in collect_schema_references(value, &schema) {
        existing_file(root, &reference.file).map_err(|e| {
            format!(
                "{file}: {}: {}: {}",
                reference.field, reference.file, e.error
            )
        })?;
    }
    if let Some(files) = value["files"].as_object() {
        for (id, scope) in files {
            if let Some(directory) = scope["directory"].as_str() {
                existing_directory(root, directory)
                    .map_err(|e| format!("{file}: files.{id}.directory: {}", e.error))?;
            }
        }
    }
    Ok(())
}

fn agent_references(rules: &Value, agents: &Value, file: &str, path: &str) -> Result<(), String> {
    let Some(rules) = rules.as_array() else {
        return Ok(());
    };
    for (index, rule) in rules.iter().enumerate() {
        let location = format!("{path}[{index}]");
        if let Some(find) = rule["find"].as_array() {
            for (position, spec) in find.iter().enumerate() {
                if let Some(id) = spec["agentId"].as_str() {
                    if agents.get(id).is_none() {
                        return Err(format!(
                            "{file}: {location}.find[{position}].agentId: unknown Agent: {id}"
                        ));
                    }
                }
            }
        }
        agent_references(&rule["then"], agents, file, &format!("{location}.then"))?;
    }
    Ok(())
}

pub(crate) fn load_definition(root: &Path, model_ids: &[String]) -> Result<Value, String> {
    let card = read_json(root, "card.json")?;
    if card["formatVersion"] != "2" {
        return Err(
            "card.json: formatVersion: unsupported protocol; migrate to formatVersion \"2\"".into(),
        );
    }
    validate(root, &card, "runtimeManifest", "card.json")?;
    let mut agents = serde_json::Map::new();
    for (id, file) in card["agents"].as_object().unwrap() {
        let file = file.as_str().unwrap();
        let definition = read_json(root, file)?;
        validate(root, &definition, "runtimeAgent", file)?;
        let model = definition["model"].as_str().unwrap();
        if model != "default" && !model_ids.iter().any(|id| id == model) {
            return Err(format!(
                "{file}: model: unknown platform model configuration: {model}"
            ));
        }
        agent_references(&definition["rules"], &card["agents"], file, "rules")?;
        agents.insert(
            id.clone(),
            json!({"id": id, "file": file, "definition": definition}),
        );
    }
    let state_file = card["stateSchema"].as_str();
    let state_schema = match state_file {
        Some(file) => read_json(root, file)?,
        None => card["state"].get("schema").cloned().unwrap_or(json!({})),
    };
    let errors = validate_state_schema(&state_schema);
    if !errors.is_empty() {
        return Err(format!(
            "{}: state.schema: {}",
            state_file.unwrap_or("card.json"),
            errors.join("; ")
        ));
    }
    let path = card["main"].as_str().unwrap();
    let main = json!({"path": path, "source": read(root, path)?});
    Ok(
        json!({"formatVersion": "2", "card": card, "main": main, "agents": agents, "stateSchema": state_schema}),
    )
}
