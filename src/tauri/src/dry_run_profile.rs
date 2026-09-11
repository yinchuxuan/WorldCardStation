use std::path::PathBuf;

pub struct CheckProfile(pub PathBuf);

impl CheckProfile {
    pub fn new() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("wcs-syntax-check-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).map_err(|error| error.to_string())?;
        Ok(Self(path))
    }
}

impl Drop for CheckProfile {
    fn drop(&mut self) {
        // This is an exclusively created WebView cache, never a card or platform data directory.
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            eprintln!("无法清理临时语法检查缓存 {}: {error}", self.0.display());
        }
    }
}
