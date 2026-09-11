use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize)]
pub struct SourceLocation {
    pub file: String,
    pub pointer: String,
}

pub type SourceMap = BTreeMap<String, SourceLocation>;

pub fn child_pointer(parent: &str, key: &str) -> String {
    format!("{parent}/{}", key.replace('~', "~0").replace('/', "~1"))
}

pub fn locate(sources: &SourceMap, pointer: &str) -> SourceLocation {
    let mut ancestor = pointer;
    loop {
        if let Some(source) = sources.get(ancestor) {
            return SourceLocation {
                file: source.file.clone(),
                pointer: format!("{}{}", source.pointer, &pointer[ancestor.len()..]),
            };
        }
        match ancestor.rsplit_once('/') {
            Some((parent, _)) => ancestor = parent,
            None => {
                return SourceLocation {
                    file: "card.json".into(),
                    pointer: pointer.into(),
                }
            }
        }
    }
}
