use crate::game_card_error::{CardResult, GameCardError};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn copy_tree(source: &Path, target: &Path, card_root: bool) -> CardResult<()> {
    let metadata = fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() {
        return Err(GameCardError::new(
            "game card import cannot contain symbolic links",
        ));
    }
    if metadata.is_file() {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, target)?;
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(GameCardError::new(
            "game card import contains an unsupported file type",
        ));
    }
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if card_root
            && ["sessions", ".wcs", ".git"]
                .iter()
                .any(|name| entry.file_name() == *name)
        {
            continue;
        }
        copy_tree(&entry.path(), &target.join(entry.file_name()), false)?;
    }
    Ok(())
}

pub fn prepare(source: &Path, parent: &Path) -> CardResult<PathBuf> {
    fs::create_dir_all(parent)?;
    let temp = staging_path(parent, "directory");
    if let Err(error) = copy_tree(source, &temp, true) {
        let _ = fs::remove_dir_all(&temp);
        return Err(error);
    }
    Ok(temp)
}

pub fn staging_path(parent: &Path, hint: &str) -> PathBuf {
    parent.join(format!(".{hint}-import-{}", Uuid::new_v4()))
}

pub fn preserve_sessions(target: &Path, temp: &Path) -> CardResult<()> {
    let sessions = target.join("sessions");
    if sessions.exists() {
        let temp_sessions = temp.join("sessions");
        let _ = fs::remove_dir_all(&temp_sessions);
        if let Err(error) = copy_tree(&sessions, &temp_sessions, false) {
            let _ = fs::remove_dir_all(&temp);
            return Err(error);
        }
    }
    Ok(())
}
