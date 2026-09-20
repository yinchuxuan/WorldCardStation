use super::*;
use uuid::Uuid;

pub struct Fixture {
    pub root: PathBuf,
    pub source: PathBuf,
    pub output: PathBuf,
}
impl Fixture {
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!("web-release-test-{}", Uuid::new_v4()));
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let source =
            game_card_copy::prepare(&repo.join("test/web/fixtures/publish-card"), &root).unwrap();
        fs::create_dir(source.join("images")).unwrap();
        fs::copy(
            repo.join("src/tauri/icons/32x32.png"),
            source.join("images/cover.png"),
        )
        .unwrap();
        Self {
            output: root.join("output"),
            root,
            source,
        }
    }
    pub fn publish(&self) -> Release {
        publish(&self.source, &self.output, Some("images/cover.png")).unwrap()
    }
    pub fn release_dir(&self, r: &Release) -> PathBuf {
        self.output.join(&r.card_id).join(&r.release_id)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
