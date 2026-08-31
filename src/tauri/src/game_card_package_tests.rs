use crate::app_storage::AppStorage;
use crate::game_card_archive::extract_archive;
use crate::game_card_imports::read_card;
use crate::game_card_package::{export_package, extract_package, ExportFormat};
use crate::game_card_repository;
use crate::game_card_schema::validate_card;
use crate::json_store::{read_json, write_json};
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("world-card-station-package-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn write_source(root: &Path, content: &str) {
    fs::create_dir_all(root).unwrap();
    write_json(
        &root.join("card.json"),
        &json!({
            "version": "1.0", "id": "package-test", "name": "Package Test",
            "files": { "content": "content.md" }, "rules": []
        }),
    )
    .unwrap();
    fs::write(root.join("content.md"), content).unwrap();
}

fn icon_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/32x32.png")
}

#[test]
fn gamecard_export_is_deterministic_and_excludes_private_data() {
    let dir = TestDir::new();
    let source = dir.0.join("source");
    let first = dir.0.join("first");
    let second = dir.0.join("second");
    write_source(&source, "hello");
    fs::create_dir_all(source.join("sessions/default")).unwrap();
    fs::write(source.join("sessions/default/messages.json"), "private").unwrap();
    fs::write(source.join(".DS_Store"), "hidden").unwrap();

    let (left, _) = export_package(&source, &first, ExportFormat::GameCard, None).unwrap();
    let (right, _) = export_package(&source, &second, ExportFormat::GameCard, None).unwrap();
    assert_eq!(fs::read(&left).unwrap(), fs::read(&right).unwrap());

    let extracted = dir.0.join("extracted");
    extract_package(&left, &extracted).unwrap();
    let card = read_card(&extracted).unwrap();
    validate_card(&card, &extracted).unwrap();
    assert!(!extracted.join("sessions").exists());
    assert!(!extracted.join(".DS_Store").exists());

    let error =
        export_package(&source, &source.join("dist"), ExportFormat::GameCard, None).unwrap_err();
    assert!(error.error.contains("outside the source"));
}

#[test]
fn png_export_renders_as_png_and_round_trips_the_archive() {
    let dir = TestDir::new();
    let source = dir.0.join("source");
    write_source(&source, "embedded");
    fs::copy(icon_path(), source.join("cover.png")).unwrap();

    let (png, checksum) = export_package(
        &source,
        &dir.0.join("output"),
        ExportFormat::Png,
        Some(Path::new("cover.png")),
    )
    .unwrap();
    assert_eq!(
        &fs::read(&png).unwrap()[0..8],
        &[137, 80, 78, 71, 13, 10, 26, 10]
    );
    assert_eq!(checksum.len(), 64);

    let extracted = dir.0.join("png-extracted");
    extract_package(&png, &extracted).unwrap();
    assert_eq!(
        fs::read_to_string(extracted.join("content.md")).unwrap(),
        "embedded"
    );

    let mut corrupted = fs::read(&png).unwrap();
    let chunk = corrupted
        .windows(4)
        .position(|bytes| bytes == b"gcAr")
        .unwrap();
    corrupted[chunk + 4 + crate::game_card_png::HEADER_SIZE] ^= 1;
    let corrupted_path = dir.0.join("corrupted.png");
    fs::write(&corrupted_path, corrupted).unwrap();
    let error = extract_package(&corrupted_path, &dir.0.join("corrupted")).unwrap_err();
    assert!(error.error.contains("CRC"));

    let error = extract_package(&icon_path(), &dir.0.join("plain-png")).unwrap_err();
    assert!(error.error.contains("does not contain"));
}

#[test]
fn archive_extraction_rejects_parent_paths() {
    let dir = TestDir::new();
    let archive_path = dir.0.join("unsafe.gamecard");
    let mut archive = ZipWriter::new(File::create(&archive_path).unwrap());
    archive
        .start_file("../escape.txt", SimpleFileOptions::default())
        .unwrap();
    archive.write_all(b"escape").unwrap();
    archive.finish().unwrap();

    let error = extract_archive(&archive_path, &dir.0.join("target")).unwrap_err();
    assert!(error.error.contains("stay inside"));
    assert!(!dir.0.join("escape.txt").exists());
}

#[tokio::test]
async fn packaged_updates_preserve_existing_sessions() {
    let dir = TestDir::new();
    let source = dir.0.join("source");
    let output = dir.0.join("output");
    let storage = AppStorage::new(dir.0.join("data"));
    write_source(&source, "first");
    let (package, _) = export_package(&source, &output, ExportFormat::GameCard, None).unwrap();
    game_card_repository::import_file(&storage, &package)
        .await
        .unwrap();
    let session = storage
        .game_cards_dir()
        .join("cards/package-test/sessions/default/messages.json");
    write_json(&session, &json!({ "messages": [{ "content": "saved" }] })).unwrap();

    fs::write(source.join("content.md"), "second").unwrap();
    let (package, _) = export_package(&source, &output, ExportFormat::GameCard, None).unwrap();
    game_card_repository::import_file(&storage, &package)
        .await
        .unwrap();

    assert_eq!(
        game_card_repository::read_text(&storage, "package-test", "content.md")
            .await
            .unwrap(),
        "second"
    );
    let saved: Value = read_json(&session).unwrap().unwrap();
    assert_eq!(saved["messages"][0]["content"], "saved");
}
