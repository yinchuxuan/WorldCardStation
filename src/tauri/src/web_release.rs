use crate::game_card_archive::{MAX_EXPANDED_SIZE, MAX_FILES, MAX_FILE_SIZE};
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_imports::{read_card, read_card_with_sources};
use crate::game_card_paths::require_safe_id;
use crate::game_card_schema::validate_card;
use crate::json_store::{read_json, write_json};
use crate::web_release_files::{collect, public_file};
use crate::web_release_protocol::{canonical, file, manifest, Catalog, Release};
use std::fs::{self, OpenOptions};
use std::path::Path;
use uuid::Uuid;

fn build(source: &Path, staging: &Path, cover: Option<&str>) -> CardResult<Release> {
    public_file(source, "card.json")?;
    let expanded = read_card_with_sources(source)?;
    for location in expanded.sources.values() {
        public_file(source, &location.file)?;
    }
    let card = expanded.card;
    validate_card(&card, source)?;
    require_safe_id(card["id"].as_str().unwrap())?;
    let mut paths = collect(source, &card)?;
    fs::create_dir(staging)?;
    let mut total = 0;
    for path in &paths {
        if path == "card.json" {
            continue;
        }
        let original = public_file(source, path)?;
        let size = original.metadata()?.len();
        total += size;
        if size > MAX_FILE_SIZE || total > MAX_EXPANDED_SIZE || paths.len() > MAX_FILES {
            return Err(GameCardError::new("Release resource limit exceeded"));
        }
        let target = staging.join(path);
        fs::create_dir_all(target.parent().unwrap())?;
        fs::copy(original, target)?;
    }
    // Preserve authorized empty scopes so the production validator can read this tree.
    if let Some(files) = card["files"].as_object() {
        for scope in files.values().filter_map(|v| v["directory"].as_str()) {
            fs::create_dir_all(staging.join(scope))?;
        }
    }
    fs::write(staging.join("card.json"), canonical(&card)?)?;
    paths.insert("card.json".into());
    let files = paths
        .iter()
        .map(|p| file(staging, p))
        .collect::<CardResult<Vec<_>>>()?;
    if files.len() > MAX_FILES
        || files.iter().any(|f| f.bytes > MAX_FILE_SIZE)
        || files.iter().map(|f| f.bytes).sum::<u64>() > MAX_EXPANDED_SIZE
    {
        return Err(GameCardError::new("Release resource limit exceeded"));
    }
    let preview = if let Some(path) = cover {
        let source_file = public_file(source, path)?;
        if !crate::web_release_protocol::media_type(path).starts_with("image/") {
            return Err(GameCardError::new("Cover must be a supported raster image"));
        }
        let preview = format!(
            "preview/cover.{}",
            path.rsplit('.').next().unwrap().to_ascii_lowercase()
        );
        if staging.join("preview").exists() {
            return Err(GameCardError::new("preview/ is reserved for the cover"));
        }
        fs::create_dir(staging.join("preview"))?;
        if source_file.metadata()?.len() > 10 * 1024 * 1024 {
            return Err(GameCardError::new("Cover exceeds 10 MiB"));
        }
        fs::copy(source_file, staging.join(&preview))?;
        Some(file(staging, &preview)?)
    } else {
        None
    };
    validate_card(&read_card(staging)?, staging)?;
    if collect(staging, &card)? != paths {
        return Err(GameCardError::new(
            "Resource dependencies changed during publishing",
        ));
    }
    let release = manifest(&card, files, preview)?;
    fs::write(staging.join("release.json"), canonical(&release)?)?;
    verify(staging, &release)?;
    Ok(release)
}

fn verify(root: &Path, expected: &Release) -> CardResult<()> {
    let actual: Release = read_json(&root.join("release.json"))?
        .ok_or_else(|| GameCardError::new("Missing release"))?;
    if &actual != expected {
        return Err(GameCardError::new("Existing immutable release differs"));
    }
    for resource in actual.files.iter().chain(actual.cover.iter()) {
        if file(root, &resource.path)? != *resource {
            return Err(GameCardError::new("Release integrity check failed"));
        }
    }
    Ok(())
}

pub fn publish(source: &Path, output: &Path, cover: Option<&str>) -> CardResult<Release> {
    let source = source.canonicalize()?;
    fs::create_dir_all(output)?;
    let output = output.canonicalize()?;
    if output.starts_with(&source) || source.starts_with(&output) {
        return Err(GameCardError::new(
            "Release output and source must be separate directories",
        ));
    }
    // A failed/stale lock is explicit; never steal another publisher's lock.
    let lock_path = output.join(".publish.lock");
    let lock = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)?;
    let staging = output.join(format!(".release-{}", Uuid::new_v4()));
    let result = (|| {
        let mut catalog: Catalog = read_json(&output.join("index.json"))?.unwrap_or(Catalog {
            format_version: 1,
            cards: Vec::new(),
        });
        if catalog.format_version != 1 {
            return Err(GameCardError::new("Unsupported catalog version"));
        }
        let release = build(&source, &staging, cover)?;
        let parent = output.join(&release.card_id);
        if parent
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err(GameCardError::new("Release destination is a symbolic link"));
        }
        fs::create_dir_all(&parent)?;
        let target = parent.join(&release.release_id);
        if target
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err(GameCardError::new("Release destination is a symbolic link"));
        }
        if target.exists() {
            verify(&target, &release)?;
        } else {
            fs::rename(&staging, &target)?;
        }
        catalog.cards.retain(|c| c.card_id != release.card_id);
        catalog.cards.push(release.catalog_entry());
        catalog.cards.sort_by(|a, b| a.card_id.cmp(&b.card_id));
        // Atomic replacement: an index failure leaves the old catalog and complete releases intact.
        write_json(&output.join("index.json"), &catalog)?;
        Ok(release)
    })();
    let _ = fs::remove_dir_all(&staging);
    drop(lock);
    let _ = fs::remove_file(lock_path);
    result
}
