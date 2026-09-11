use std::borrow::Cow;
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};

pub struct CheckAssets;
const HTML: &[u8] = b"<!doctype html><html><head><meta charset='utf-8'><script defer src='dry-run.js'></script></head><body></body></html>";
const SCRIPT: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/dry-run.js"));

impl tauri::Assets<tauri::Wry> for CheckAssets {
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        match key.as_ref().trim_start_matches('/') {
            "" | "index.html" => Some(Cow::Borrowed(HTML)),
            "dry-run.js" => Some(Cow::Borrowed(SCRIPT)),
            _ => None,
        }
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(
            [("index.html", HTML), ("dry-run.js", SCRIPT)]
                .into_iter()
                .map(|(name, bytes)| (Cow::Borrowed(name), Cow::Borrowed(bytes))),
        )
    }
    fn csp_hashes(&self, _: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}
