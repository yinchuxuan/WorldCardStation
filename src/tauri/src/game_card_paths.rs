use crate::game_card_error::{CardResult, GameCardError};
use std::path::{Component, Path, PathBuf};

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '_' | '-'))
}

pub fn require_safe_id(id: &str) -> CardResult<()> {
    if is_safe_id(id) {
        Ok(())
    } else {
        Err(GameCardError::new("Game card must have a safe id"))
    }
}

pub fn card_dir(cards_dir: &Path, id: &str) -> CardResult<PathBuf> {
    require_safe_id(id)?;
    Ok(cards_dir.join(id))
}

pub fn assert_safe_relative(path: &str, extension: Option<&str>) -> CardResult<()> {
    if path.is_empty() || path.contains('\\') || Path::new(path).is_absolute() {
        return Err(GameCardError::new("game card path must be a relative path"));
    }
    if Path::new(path).components().any(|part| {
        matches!(
            part,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) || path.split('/').any(str::is_empty)
    {
        return Err(GameCardError::new(
            "game card path must stay inside game card directory",
        ));
    }
    if extension.is_some_and(|expected| {
        Path::new(path).extension().and_then(|v| v.to_str()) != Some(expected)
    }) {
        return Err(GameCardError::new(format!(
            "game card path must point to a .{} file",
            extension.unwrap()
        )));
    }
    Ok(())
}

pub fn existing_file(root: &Path, relative: &str) -> CardResult<PathBuf> {
    assert_safe_relative(relative, None)?;
    let real_root = root
        .canonicalize()
        .map_err(|_| GameCardError::new("Game card directory not found"))?;
    let candidate = root.join(relative);
    let real_file = candidate
        .canonicalize()
        .map_err(|_| GameCardError::new(format!("game card file not found: {relative}")))?;
    if !real_file.starts_with(&real_root) || !real_file.is_file() {
        return Err(GameCardError::new(
            "game card path must stay inside game card directory",
        ));
    }
    Ok(real_file)
}

pub fn existing_directory(root: &Path, relative: &str) -> CardResult<PathBuf> {
    assert_safe_relative(relative, None)?;
    let real_root = root
        .canonicalize()
        .map_err(|_| GameCardError::new("Game card directory not found"))?;
    let real_directory = root
        .join(relative)
        .canonicalize()
        .map_err(|_| GameCardError::new(format!("game card directory not found: {relative}")))?;
    if !real_directory.starts_with(&real_root) || !real_directory.is_dir() {
        return Err(GameCardError::new(
            "game card path must stay inside game card directory",
        ));
    }
    Ok(real_directory)
}
