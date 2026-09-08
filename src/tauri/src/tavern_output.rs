use crate::game_card_archive::{MAX_EXPANDED_SIZE, MAX_FILES, MAX_FILE_SIZE};
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_imports::read_card;
use crate::game_card_paths::assert_safe_relative;
use crate::game_card_schema::validate_card;
use crate::tavern_input::Input;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CopyPlan {
    pub resource_id: String,
    pub path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    pub files: BTreeMap<String, String>,
    pub copies: Vec<CopyPlan>,
    pub worldbook: bool,
}

fn safe_path(path: &str, paths: &mut HashSet<String>) -> CardResult<()> {
    assert_safe_relative(path, None)?;
    if path.split('/').any(|part| {
        part == "."
            || part == ".."
            || part.contains(':')
            || part.chars().any(char::is_control)
            || part.ends_with(['.', ' '])
    }) || path.eq_ignore_ascii_case("sessions")
        || path.to_lowercase().starts_with("sessions/")
        || !paths.insert(path.to_lowercase())
    {
        return Err(GameCardError::new("转换产物路径无效、重复或指向 sessions"));
    }
    Ok(())
}

pub fn stage(input: &Input, target: &Path, plan: Plan, expected_id: &str) -> CardResult<Value> {
    let mut files = plan.files;
    if let Some(manifest) = files.get_mut("import/manifest.json") {
        let mut value: Value =
            serde_json::from_str(manifest).map_err(|_| GameCardError::new("转换清单无效"))?;
        if !value.is_object() {
            return Err(GameCardError::new("转换清单必须是对象"));
        }
        value["fingerprint"] = input.fingerprint.clone().into();
        if plan.worldbook {
            value["worldbookLibrarySha256"] = crate::tavern_bundle::fingerprint().into();
        }
        *manifest = serde_json::to_string_pretty(&value).unwrap();
    }
    if plan.worldbook {
        for (path, source) in crate::tavern_bundle::worldbook() {
            if files.insert(path.into(), source.into()).is_some() {
                return Err(GameCardError::new("转换产物不能覆盖内置世界书库"));
            }
        }
    }
    if files.len() + plan.copies.len() > MAX_FILES {
        return Err(GameCardError::new("转换产物超过 4096 文件"));
    }
    let mut paths = HashSet::new();
    let mut size = 0_u64;
    for (path, text) in &files {
        safe_path(path, &mut paths)?;
        size += text.len() as u64;
        if text.len() as u64 > 64 * 1024 * 1024 || size > 64 * 1024 * 1024 {
            return Err(GameCardError::new("转换文本超过 64 MiB"));
        }
    }
    for copy in &plan.copies {
        safe_path(&copy.path, &mut paths)?;
        if !copy.path.starts_with("assets/") {
            return Err(GameCardError::new("复制资源只能写入 assets"));
        }
        let resource = input
            .resources
            .iter()
            .find(|resource| resource.id == copy.resource_id)
            .ok_or_else(|| GameCardError::new("资源不属于本次导入授权"))?;
        let metadata = fs::symlink_metadata(&resource.path)?;
        if !metadata.is_file() || metadata.len() > MAX_FILE_SIZE {
            return Err(GameCardError::new("资源类型或大小无效"));
        }
        size += metadata.len();
        if size > MAX_EXPANDED_SIZE {
            return Err(GameCardError::new("转换资源总量超限"));
        }
    }
    fs::create_dir(target)?;
    for (path, text) in files {
        let output = target.join(path);
        fs::create_dir_all(output.parent().unwrap())?;
        fs::write(output, text)?;
    }
    for copy in plan.copies {
        let resource = input
            .resources
            .iter()
            .find(|resource| resource.id == copy.resource_id)
            .unwrap();
        let output = target.join(copy.path);
        fs::create_dir_all(output.parent().unwrap())?;
        fs::copy(&resource.path, output)?;
    }
    let card = read_card(target)?;
    if card["id"].as_str() != Some(expected_id) {
        return Err(GameCardError::new("转换产物与确认的安装 ID 不一致"));
    }
    validate_card(&card, target)?;
    Ok(card)
}
