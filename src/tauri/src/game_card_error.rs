use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCardError {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub details: Vec<ValidationDetail>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub canceled: bool,
}

#[derive(Debug, Serialize)]
pub struct ValidationDetail {
    pub file: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pointer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<usize>,
}

impl ValidationDetail {
    pub fn new(
        file: impl Into<String>,
        message: impl Into<String>,
        pointer: Option<String>,
    ) -> Self {
        Self {
            file: file.into(),
            message: message.into(),
            pointer,
            line: None,
            column: None,
        }
    }
}

pub type CardResult<T> = Result<T, GameCardError>;

impl GameCardError {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            stage: None,
            file: None,
            details: Vec::new(),
            canceled: false,
        }
    }

    pub fn validation(
        error: impl Into<String>,
        stage: &str,
        file: Option<&str>,
        details: Vec<ValidationDetail>,
    ) -> Self {
        Self {
            error: error.into(),
            stage: Some(stage.to_string()),
            file: file.map(str::to_string),
            details,
            canceled: false,
        }
    }

    pub fn canceled() -> Self {
        let mut error = Self::new("canceled");
        error.canceled = true;
        error
    }
}

impl From<String> for GameCardError {
    fn from(error: String) -> Self {
        Self::new(error)
    }
}

impl From<std::io::Error> for GameCardError {
    fn from(error: std::io::Error) -> Self {
        Self::new(error.to_string())
    }
}
