use crate::app_storage::AppStorage;
use crate::json_store::AppResult;
use crate::sessions::is_safe_id;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TraceScope {
    pub card_id: String,
    pub session_id: String,
}

fn no_link(path: &Path) -> AppResult<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Trace paths cannot contain reparse points".into());
        }
    }
    if metadata.file_type().is_symlink() {
        return Err("Trace paths cannot contain symbolic links".into());
    }
    Ok(())
}

pub fn directory(storage: &AppStorage, scope: &TraceScope, create: bool) -> AppResult<PathBuf> {
    if !is_safe_id(&scope.card_id) || !is_safe_id(&scope.session_id) {
        return Err("Invalid trace card/session id".into());
    }
    let mut current = storage.game_cards_dir();
    for (index, part) in ["cards", &scope.card_id, "sessions", &scope.session_id]
        .iter()
        .enumerate()
    {
        current.push(part);
        if create && index >= 2 && !current.exists() {
            fs::create_dir(&current).map_err(|error| error.to_string())?;
        }
        no_link(&current)?;
        if !current.is_dir() {
            return Err("Trace session directory is unavailable".into());
        }
    }
    Ok(current)
}

pub fn append(path: &Path, records: &[Value]) -> AppResult<()> {
    if path.symlink_metadata().is_ok() {
        no_link(path)?;
        if !path.is_file() {
            return Err("Trace destination is not a file".into());
        }
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .read(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() > 0 {
        file.seek(SeekFrom::End(-1))
            .map_err(|error| error.to_string())?;
        let mut last = [0];
        file.read_exact(&mut last)
            .map_err(|error| error.to_string())?;
        if last[0] != b'\n' {
            return Err("Trace is incomplete: last JSONL record is truncated; preserve it and use a new session".into());
        }
    }
    for record in records {
        let mut bytes = serde_json::to_vec(record).map_err(|error| error.to_string())?;
        bytes.push(b'\n');
        file.write_all(&bytes)
            .map_err(|error| format!("Trace is incomplete: {error}"))?;
    }
    file.sync_data()
        .map_err(|error| format!("Trace is incomplete: {error}"))
}

pub fn fingerprint(root: &Path) -> AppResult<String> {
    fn visit(root: &Path, current: &Path, hash: &mut Sha256) -> AppResult<()> {
        let mut paths = fs::read_dir(current)
            .map_err(|error| error.to_string())?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        paths.sort();
        for path in paths {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            if ["sessions", ".wcs", ".git", ".DS_Store"].contains(&name) {
                continue;
            }
            no_link(&path)?;
            if path.is_dir() {
                visit(root, &path, hash)?;
                continue;
            }
            if !path.is_file() {
                return Err("Unsupported trace fingerprint file".into());
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_str()
                .ok_or("Invalid UTF-8 card path")?
                .replace(std::path::MAIN_SEPARATOR, "/");
            hash.update(relative.as_bytes());
            hash.update([0]);
            let mut file = fs::File::open(&path).map_err(|error| error.to_string())?;
            hash.update(
                file.metadata()
                    .map_err(|error| error.to_string())?
                    .len()
                    .to_le_bytes(),
            );
            let mut buffer = [0; 65536];
            loop {
                let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
                if count == 0 {
                    break;
                }
                hash.update(&buffer[..count]);
            }
        }
        Ok(())
    }
    let mut hash = Sha256::new();
    visit(root, root, &mut hash)?;
    Ok(format!("{:x}", hash.finalize()))
}
