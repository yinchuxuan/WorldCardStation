use crate::game_card_archive::extract_archive;
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_png::{file_sha256, sha256_hex, PNG_SIGNATURE};
use crate::tavern_png::{parse_json, read_character, MAX_JSON};
use crate::tavern_resources::{inventory, Resource};
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct Input {
    pub root: PathBuf,
    pub native: Option<PathBuf>,
    pub source: Value,
    pub resources: Vec<Resource>,
    pub fingerprint: String,
    pub container: String,
}

impl Drop for Input {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

pub fn prepare(path: &Path, parent: &Path) -> CardResult<Input> {
    fs::create_dir_all(parent)?;
    let root = parent.join(format!(".tavern-{}", Uuid::new_v4()));
    fs::create_dir(&root)?;
    let mut prepared = Input {
        root,
        native: None,
        source: Value::Null,
        resources: vec![],
        fingerprint: String::new(),
        container: String::new(),
    };
    let snapshot = prepared.root.join("source");
    if !path.is_file() || path.metadata()?.len() > 1537 * 1024 * 1024 {
        return Err(GameCardError::new("导入文件不存在或超限"));
    }
    fs::copy(path, &snapshot)?;
    prepared.fingerprint = sha256_hex(&file_sha256(&snapshot)?);
    let input = prepared.root.join("input");
    fs::create_dir(&input)?;
    let mut magic = [0; 8];
    let count = File::open(&snapshot)?.read(&mut magic)?;
    let is_png = count == 8 && magic == PNG_SIGNATURE;
    if is_png {
        if let Some(source) = read_character(&snapshot)? {
            prepared.source = source;
            prepared.container = "png/apng".into();
        } else {
            prepared.native = Some(snapshot);
            return Ok(prepared);
        }
    } else if magic[..4] == *b"PK\x03\x04" {
        extract_archive(&snapshot, &input)?;
        let card_path = input.join("card.json");
        if card_path.metadata()?.len() > MAX_JSON as u64 {
            return Err(GameCardError::new("card.json 超限"));
        }
        prepared.source = parse_json(&fs::read(card_path)?)?;
        if prepared.source.get("spec").is_none() {
            prepared.native = Some(snapshot);
            return Ok(prepared);
        }
        prepared.container = "charx".into();
    } else {
        if snapshot.metadata()?.len() > MAX_JSON as u64 {
            return Err(GameCardError::new("角色 JSON 超限或未知容器"));
        }
        prepared.source = parse_json(&fs::read(&snapshot)?)?;
        prepared.container = "json".into();
    }
    if !matches!(
        prepared.source["spec"].as_str(),
        Some("chara_card_v2" | "chara_card_v3")
    ) {
        return Err(GameCardError::new("只支持 V2/V3 酒馆角色卡"));
    }
    prepared.resources = inventory(
        &prepared.source,
        &input,
        is_png.then_some(snapshot.as_path()),
    )?;
    Ok(prepared)
}

pub fn preview(input: &Input, token: &str, id: &str) -> Value {
    json!({ "kind": "tavern", "token": token, "id": id, "source": input.source,
        "resources": input.resources, "fingerprint": input.fingerprint, "container": input.container })
}
