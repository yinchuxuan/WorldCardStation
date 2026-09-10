use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub retained_paths: Vec<String>,
}

impl InitError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retained_paths: Vec::new(),
        }
    }

    pub fn io(path: &Path, error: impl std::fmt::Display) -> Self {
        Self::new("io_error", format!("{}: {error}", path.display()))
    }
}

pub type InitResult<T> = Result<T, InitError>;
