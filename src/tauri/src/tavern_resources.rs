use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_paths::{assert_safe_relative, existing_file};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
pub struct Resource {
    pub id: String,
    pub uri: String,
    pub size: u64,
    #[serde(skip)]
    pub path: PathBuf,
}

pub fn inventory(source: &Value, input: &Path, png: Option<&Path>) -> CardResult<Vec<Resource>> {
    let mut resources = Vec::new();
    let mut seen = HashSet::new();
    let assets = source["data"]["assets"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for asset in assets {
        let Some(uri) = asset["uri"].as_str() else {
            continue;
        };
        if !seen.insert(uri.to_string()) {
            continue;
        }
        let candidate = if let Some(relative) = uri.strip_prefix("embeded://") {
            // References only resolve to already extracted, authorized package files.
            assert_safe_relative(relative, None)?;
            if input.join(relative).is_file() {
                Some(existing_file(input, relative)?)
            } else {
                None
            }
        } else if uri.starts_with("data:") {
            decode_data(uri, input, resources.len())?
        } else {
            None
        };
        if let Some(path) = candidate {
            resources.push(Resource {
                id: format!("r{}", resources.len()),
                uri: uri.into(),
                size: path.metadata()?.len(),
                path,
            });
        }
    }
    if let Some(path) = png {
        if path.metadata()?.len() <= crate::game_card_archive::MAX_FILE_SIZE {
            resources.push(Resource {
                id: format!("r{}", resources.len()),
                uri: "ccdefault:".into(),
                size: path.metadata()?.len(),
                path: path.into(),
            });
        }
    }
    Ok(resources)
}

fn decode_data(uri: &str, input: &Path, index: usize) -> CardResult<Option<PathBuf>> {
    let Some((mime, payload)) = uri
        .strip_prefix("data:")
        .and_then(|text| text.split_once(";base64,"))
    else {
        return Ok(None);
    };
    if ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp",
    ]
    .contains(&mime)
        || payload.len() > 12 * 1024 * 1024
    {
        return Ok(None);
    }
    let bytes = STANDARD
        .decode(payload)
        .map_err(|_| GameCardError::new("资源 data URL Base64 无效"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Ok(None);
    }
    // This directory is separate from the untrusted extracted archive namespace.
    let path = input.parent().unwrap().join(format!("inline-{index}"));
    fs::write(&path, bytes)?;
    Ok(Some(path))
}
