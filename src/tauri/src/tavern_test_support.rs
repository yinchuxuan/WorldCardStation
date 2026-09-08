use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipWriter};

pub struct TestDir(pub PathBuf);
impl TestDir {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!("wcs-tavern-test-{}", Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        Self(root)
    }
}
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn character(version: &str) -> Value {
    json!({ "spec": format!("chara_card_{version}"), "spec_version": if version == "v3" { "3.0" } else { "2.0" }, "data": { "name": "Alice" } })
}

pub fn input_file(root: &Path) -> PathBuf {
    let path = root.join("source.json");
    fs::write(&path, character("v2").to_string()).unwrap();
    path
}

pub fn png(chunks: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
    let mut png = fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/32x32.png")).unwrap();
    let tail = png.split_off(png.len() - 12);
    for (kind, bytes) in chunks {
        png.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
        png.extend_from_slice(*kind);
        png.extend_from_slice(bytes);
        let mut hash = crc32fast::Hasher::new();
        hash.update(*kind);
        hash.update(bytes);
        png.extend_from_slice(&hash.finalize().to_be_bytes());
    }
    png.extend_from_slice(&tail);
    png
}

pub fn zip(path: &Path, entries: &[(&str, &[u8])]) {
    let mut writer = ZipWriter::new(fs::File::create(path).unwrap());
    for (name, bytes) in entries {
        writer
            .start_file(*name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
}

pub fn plan(id: &str) -> crate::tavern_output::Plan {
    serde_json::from_value(json!({ "files": { "card.json": json!({ "id": id, "name": "Converted", "version": "1", "rules": [] }).to_string() },
        "copies": [], "worldbook": false })).unwrap()
}
