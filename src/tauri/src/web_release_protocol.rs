use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_png::{file_sha256, sha256_hex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReleaseFile {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
    pub media_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Release {
    pub format_version: u32,
    pub card_id: String,
    pub card_version: String,
    pub release_id: String,
    pub content_fingerprint: String,
    pub schema_version: String,
    pub platform_version: String,
    pub entry: String,
    pub name: String,
    pub description: String,
    pub files: Vec<ReleaseFile>,
    pub cover: Option<ReleaseFile>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogEntry {
    pub card_id: String,
    pub card_version: String,
    pub release_id: String,
    pub name: String,
    pub description: String,
    pub release: String,
    pub cover: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub format_version: u32,
    pub cards: Vec<CatalogEntry>,
}

// Sort recursively even if another dependency enables serde_json/preserve_order.
pub fn canonical(value: &impl Serialize) -> CardResult<Vec<u8>> {
    let mut value = serde_json::to_value(value).map_err(|e| GameCardError::new(e.to_string()))?;
    value.sort_all_objects();
    serde_json::to_vec(&value).map_err(|e| GameCardError::new(e.to_string()))
}

pub fn digest(bytes: &[u8]) -> String {
    sha256_hex(&Sha256::digest(bytes).into())
}

pub fn media_type(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "json" => "application/json",
        "js" | "jsx" => "text/javascript",
        "css" => "text/css",
        "md" | "txt" => "text/plain",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        _ => "application/octet-stream",
    }
}

pub fn file(root: &Path, path: &str) -> CardResult<ReleaseFile> {
    let source = crate::web_release_files::public_file(root, path)?;
    Ok(ReleaseFile {
        path: path.into(),
        bytes: source.metadata()?.len(),
        sha256: sha256_hex(&file_sha256(&source)?),
        media_type: media_type(path).into(),
    })
}

pub fn fingerprint(files: &[ReleaseFile]) -> String {
    let mut digest = Sha256::new();
    digest.update(b"wcs-content-v1\0");
    for file in files {
        digest.update((file.path.len() as u64).to_be_bytes());
        digest.update(file.path.as_bytes());
        digest.update(file.bytes.to_be_bytes());
        digest.update(file.sha256.as_bytes());
    }
    format!("wcs-content-v1-{}", sha256_hex(&digest.finalize().into()))
}

pub fn release_id(release: &Release) -> CardResult<String> {
    let mut value = serde_json::to_value(release).map_err(|e| GameCardError::new(e.to_string()))?;
    value.as_object_mut().unwrap().remove("releaseId");
    Ok(format!("sha256-{}", digest(&canonical(&value)?)))
}

pub fn manifest(
    card: &Value,
    files: Vec<ReleaseFile>,
    cover: Option<ReleaseFile>,
) -> CardResult<Release> {
    let schema: Value = serde_json::from_str(include_str!(
        "../../shared/game-card/schema/game-card.schema.json"
    ))
    .unwrap();
    let mut release = Release {
        format_version: 1,
        card_id: card["id"].as_str().unwrap().into(),
        card_version: card["version"].as_str().unwrap().into(),
        release_id: String::new(),
        content_fingerprint: fingerprint(&files),
        schema_version: schema["x-schema-version"].as_str().unwrap().into(),
        platform_version: env!("CARGO_PKG_VERSION").into(),
        entry: "card.json".into(),
        name: card["name"].as_str().unwrap().into(),
        description: card["description"].as_str().unwrap_or("").into(),
        files,
        cover,
    };
    release.release_id = release_id(&release)?;
    Ok(release)
}

impl Release {
    pub fn catalog_entry(&self) -> CatalogEntry {
        let base = format!("{}/{}/", self.card_id, self.release_id);
        CatalogEntry {
            card_id: self.card_id.clone(),
            card_version: self.card_version.clone(),
            release_id: self.release_id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            release: format!("{base}release.json"),
            cover: self.cover.as_ref().map(|c| format!("{base}{}", c.path)),
        }
    }
}
