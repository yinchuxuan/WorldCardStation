use crate::app_storage::AppStorage;
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_repository;
use crate::game_runtime_definition::load_definition;
use crate::tavern_input::{self, NativeInput};
use serde_json::Value;
use std::path::Path;

pub fn validate_installed(storage: &AppStorage, id: &str) -> CardResult<()> {
    let root = crate::game_card_paths::card_dir(&storage.game_cards_dir().join("cards"), id)?;
    load_definition(&root, &[])
        .map(|_| ())
        .map_err(GameCardError::new)
}

pub async fn import(storage: &AppStorage, path: &Path) -> CardResult<Value> {
    let parent = storage.game_cards_dir().join("cards");
    let path = path.to_path_buf();
    let input = tokio::task::spawn_blocking(move || tavern_input::prepare(&path, &parent))
        .await
        .map_err(|error| GameCardError::new(error.to_string()))??;
    let root = match &input.native {
        Some(NativeInput::Project(root)) => root.clone(),
        Some(NativeInput::Package(package)) => {
            let root = input.root.join("native");
            crate::game_card_package::extract_package(package, &root)?;
            root
        }
        None => return Err(GameCardError::new(
            "酒馆转换尚未支持 formatVersion 2，请先迁移为包含 main.js 和 Agent 定义的原生游戏卡。",
        )),
    };
    load_definition(&root, &[]).map_err(GameCardError::new)?;
    game_card_repository::import(storage, &root).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tavern_test_support::{character, TestDir};

    #[tokio::test]
    async fn player_import_accepts_runtime_card_and_rejects_legacy_without_installing() {
        let dir = TestDir::new();
        let storage = AppStorage::new(dir.0.join("data"));
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../test/fixtures/runtime-delivery/card.json");
        let card = import(&storage, &fixture).await.unwrap();
        assert_eq!(card["formatVersion"], "2");
        let legacy = dir.0.join("card.json");
        std::fs::write(
            &legacy,
            r#"{"id":"old","version":"1","name":"Old","rules":[]}"#,
        )
        .unwrap();
        assert!(import(&storage, &legacy)
            .await
            .unwrap_err()
            .error
            .contains("formatVersion"));
        std::fs::write(&legacy, character("v2").to_string()).unwrap();
        assert!(import(&storage, &legacy)
            .await
            .unwrap_err()
            .error
            .contains("酒馆转换"));
        assert_eq!(game_card_repository::list(&storage).await.unwrap().len(), 1);
        assert_eq!(
            game_card_repository::active(&storage)
                .await
                .unwrap()
                .unwrap()["id"],
            card["id"]
        );
    }
}
