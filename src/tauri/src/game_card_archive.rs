use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_paths::assert_safe_relative;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipArchive, ZipWriter};

pub const MAX_ARCHIVE_SIZE: u64 = 1024 * 1024 * 1024;
pub const MAX_EXPANDED_SIZE: u64 = 2 * MAX_ARCHIVE_SIZE;
pub const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;
pub const MAX_FILES: usize = 4096;
fn card_error(error: impl ToString) -> GameCardError {
    GameCardError::new(error.to_string())
}

fn excluded(relative: &str) -> bool {
    let parts: Vec<_> = relative.split('/').collect();
    matches!(parts.first(), Some(&"sessions" | &".wcs"))
        || parts.iter().any(|part| {
            *part == ".DS_Store" || *part == "__MACOSX" || *part == ".git" || part.starts_with("._")
        })
        || relative.ends_with(".gamecard")
        || relative.ends_with(".zip")
}

fn collect_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<(String, PathBuf)>,
) -> CardResult<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(GameCardError::new(
                "game card export cannot contain symbolic links",
            ));
        }
        let relative = path
            .strip_prefix(root)
            .map_err(card_error)?
            .to_str()
            .ok_or_else(|| GameCardError::new("game card paths must be valid UTF-8"))?
            .replace(std::path::MAIN_SEPARATOR, "/");
        if excluded(&relative) {
            continue;
        }
        if metadata.is_dir() {
            collect_files(root, &path, files)?;
        } else if metadata.is_file() {
            files.push((relative, path));
        } else {
            return Err(GameCardError::new(
                "game card export contains an unsupported file type",
            ));
        }
    }
    Ok(())
}

fn compression_for(path: &str) -> CompressionMethod {
    match Path::new(path).extension().and_then(|value| value.to_str()) {
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "mp3" | "ogg" | "m4a") => {
            CompressionMethod::Stored
        }
        _ => CompressionMethod::Deflated,
    }
}

pub fn write_archive(source: &Path, output: &Path) -> CardResult<()> {
    let mut files = Vec::new();
    collect_files(source, source, &mut files)?;
    files.sort_by(|left, right| left.0.cmp(&right.0));
    if files.len() > MAX_FILES {
        return Err(GameCardError::new("game card contains too many files"));
    }
    let writer = BufWriter::new(File::create(output)?);
    let mut archive = ZipWriter::new(writer);
    for (relative, path) in files {
        assert_safe_relative(&relative, None)?;
        let options = SimpleFileOptions::default()
            .compression_method(compression_for(&relative))
            .last_modified_time(DateTime::default())
            .unix_permissions(0o644);
        archive.start_file(relative, options).map_err(card_error)?;
        let mut input = BufReader::new(File::open(path)?);
        io::copy(&mut input, &mut archive)?;
    }
    let mut writer = archive.finish().map_err(card_error)?;
    writer.flush()?;
    if fs::metadata(output)?.len() > MAX_ARCHIVE_SIZE {
        return Err(GameCardError::new("game card archive is too large"));
    }
    Ok(())
}

fn normalized_name(raw: &[u8], is_dir: bool) -> CardResult<String> {
    let name = std::str::from_utf8(raw)
        .map_err(|_| GameCardError::new("game card archive paths must be valid UTF-8"))?;
    let normalized = if is_dir {
        name.strip_suffix('/').unwrap_or(name)
    } else {
        name
    };
    assert_safe_relative(normalized, None)?;
    if normalized == "sessions" || normalized.starts_with("sessions/") {
        return Err(GameCardError::new(
            "game card archive cannot contain sessions",
        ));
    }
    Ok(normalized.to_string())
}

fn validate_mode(mode: Option<u32>, is_dir: bool) -> CardResult<()> {
    let Some(mode) = mode else { return Ok(()) };
    let kind = mode & 0o170000;
    let valid = kind == 0 || (is_dir && kind == 0o040000) || (!is_dir && kind == 0o100000);
    if valid {
        Ok(())
    } else {
        Err(GameCardError::new(
            "game card archive contains an unsupported file type",
        ))
    }
}

pub fn extract_archive(input: &Path, target: &Path) -> CardResult<()> {
    if fs::metadata(input)?.len() > MAX_ARCHIVE_SIZE {
        return Err(GameCardError::new("game card archive is too large"));
    }
    let mut archive = ZipArchive::new(BufReader::new(File::open(input)?)).map_err(card_error)?;
    if archive.len() > MAX_FILES {
        return Err(GameCardError::new(
            "game card archive contains too many files",
        ));
    }
    fs::create_dir_all(target)?;
    let mut paths = HashSet::new();
    let mut expanded = 0_u64;
    let mut root_cards = 0;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(card_error)?;
        let is_dir = entry.is_dir();
        if entry.encrypted() {
            return Err(GameCardError::new(
                "game card archive cannot contain encrypted files",
            ));
        }
        validate_mode(entry.unix_mode(), is_dir)?;
        let name = normalized_name(entry.name_raw(), is_dir)?;
        if name == ".wcs" || name.starts_with(".wcs/") {
            continue;
        }
        let folded = name.to_lowercase();
        if !paths.insert(folded) {
            return Err(GameCardError::new(
                "game card archive contains duplicate paths",
            ));
        }
        if name == "card.json" {
            root_cards += 1;
        }
        if is_dir {
            fs::create_dir_all(target.join(name))?;
            continue;
        }
        if entry.size() > MAX_FILE_SIZE {
            return Err(GameCardError::new("game card archive file is too large"));
        }
        let declared_size = entry.size();
        let output = target.join(name);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut writer = BufWriter::new(File::create(output)?);
        let remaining_total = MAX_EXPANDED_SIZE - expanded;
        let limit = MAX_FILE_SIZE.min(remaining_total).saturating_add(1);
        let copied = io::copy(&mut entry.take(limit), &mut writer)?;
        writer.flush()?;
        if copied > MAX_FILE_SIZE {
            return Err(GameCardError::new("game card archive file is too large"));
        }
        expanded += copied;
        if expanded > MAX_EXPANDED_SIZE {
            return Err(GameCardError::new("game card expanded size is too large"));
        }
        if copied != declared_size {
            return Err(GameCardError::new("game card archive entry is truncated"));
        }
    }
    if root_cards != 1 {
        return Err(GameCardError::new(
            "game card archive must contain card.json at its root",
        ));
    }
    Ok(())
}
