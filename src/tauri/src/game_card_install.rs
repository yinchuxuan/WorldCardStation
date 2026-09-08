use crate::app_storage::AppStorage;
use crate::game_card_copy::{preserve_sessions, staging_path};
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_imports::read_card;
use crate::game_card_paths::card_dir;
use crate::game_card_schema::validate_card;
use crate::json_store::write_json;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

pub async fn install(storage: &AppStorage, staging: &Path) -> CardResult<Value> {
    install_checked(storage, staging, None).await
}

pub async fn install_checked(
    storage: &AppStorage,
    staging: &Path,
    expected: Option<Option<Value>>,
) -> CardResult<Value> {
    let card = read_card(staging)?;
    let id = card["id"]
        .as_str()
        .ok_or_else(|| GameCardError::new("Game card must have a safe id"))?;
    validate_card(&card, staging)?;
    let parent = storage.game_cards_dir().join("cards");
    let target = card_dir(&parent, id)?;
    let active = storage.game_cards_dir().join("active.json");
    // Same lock order as uninstall: activation and directory replacement form one commit.
    let _active_guard = storage.lock(&active).await;
    let _card_guard = storage.lock(&target).await;
    if let Some(expected) = expected {
        let current = if target.join("card.json").exists() {
            Some(read_card(&target)?)
        } else {
            None
        };
        if current != expected {
            return Err(GameCardError::new("安装目标已改变，请重新转换确认"));
        }
    }
    preserve_sessions(&target, staging)?;
    let backup = staging_path(&parent, "backup");
    let replacing = target.exists();
    if replacing {
        fs::rename(&target, &backup)?;
    }
    let result = fs::rename(staging, &target)
        .map_err(GameCardError::from)
        .and_then(|_| write_json(&active, &json!({ "id": id })).map_err(GameCardError::from));
    if let Err(error) = result {
        // If the new directory was installed, return it to task staging before restoring the old one.
        let rollback = (|| -> std::io::Result<()> {
            if target.exists() {
                fs::rename(&target, staging)?;
            }
            if replacing {
                fs::rename(&backup, &target)?;
            }
            Ok(())
        })();
        return Err(rollback.err().map_or(error, |rollback| {
            GameCardError::new(format!(
                "安装失败且回滚失败：{rollback}；备份保留于 {}",
                backup.display()
            ))
        }));
    }
    if replacing {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(card)
}
