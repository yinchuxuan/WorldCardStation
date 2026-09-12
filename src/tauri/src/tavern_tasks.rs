use crate::app_storage::AppStorage;
use crate::game_card_error::{CardResult, GameCardError};
use crate::game_card_repository;
use crate::tavern_input::{self, Input, NativeInput};
use crate::tavern_output::{self, Plan};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

struct Task {
    input: Input,
    id: String,
    created: Instant,
    revision: Option<String>,
    previous: Option<Value>,
}

#[derive(Default)]
pub struct TavernTasks {
    tasks: Mutex<HashMap<String, Task>>,
}

impl TavernTasks {
    #[cfg(test)]
    pub async fn prepare(&self, storage: &AppStorage, path: &Path) -> CardResult<Value> {
        self.prepare_file(storage, path, false).await
    }

    pub async fn prepare_file(
        &self,
        storage: &AppStorage,
        path: &Path,
        tavern_only: bool,
    ) -> CardResult<Value> {
        let path = path.to_path_buf();
        let parent = storage.game_cards_dir().join("cards");
        let input = tokio::task::spawn_blocking(move || tavern_input::prepare(&path, &parent))
            .await
            .map_err(|error| GameCardError::new(error.to_string()))??;
        if let Some(native) = &input.native {
            if tavern_only {
                return Err(GameCardError::new(
                    "更新酒馆卡请选择 V2/V3 酒馆源文件；原生游戏卡请使用导入卡片",
                ));
            }
            return match native {
                NativeInput::Package(path) => {
                    game_card_repository::import_file(storage, path).await
                }
                NativeInput::Project(path) => game_card_repository::import(storage, path).await,
            };
        }
        let mut tasks = self.tasks.lock().await;
        tasks.retain(|_, task| task.created.elapsed() < Duration::from_secs(1800));
        if tasks.len() >= 4 {
            return Err(GameCardError::new("已有过多待确认导入，请先取消"));
        }
        let token = Uuid::new_v4().to_string();
        let id = format!("tavern-{}", Uuid::new_v4());
        let preview = tavern_input::preview(&input, &token, &id);
        tasks.insert(
            token,
            Task {
                input,
                id,
                created: Instant::now(),
                revision: None,
                previous: None,
            },
        );
        Ok(preview)
    }

    pub async fn stage(
        &self,
        storage: &AppStorage,
        token: &str,
        plan: Plan,
        target: Option<String>,
    ) -> CardResult<Value> {
        let mut tasks = self.tasks.lock().await;
        let task = tasks
            .get_mut(token)
            .ok_or_else(|| GameCardError::new("导入任务已取消或过期"))?;
        if task.created.elapsed() > Duration::from_secs(1800) {
            tasks.remove(token);
            return Err(GameCardError::new("导入任务已过期"));
        }
        task.revision = None;
        let previous = match &target {
            Some(id) => Some(
                game_card_repository::get(storage, id)
                    .await?
                    .ok_or_else(|| GameCardError::new("更新目标已不存在"))?,
            ),
            None => None,
        };
        let output = task.input.root.join("output");
        if output.exists() {
            fs::remove_dir_all(&output)?;
        }
        let staged = tavern_output::stage(
            &task.input,
            &output,
            plan,
            target.as_deref().unwrap_or(&task.id),
        );
        let card = match staged {
            Ok(card) => card,
            Err(error) => {
                let _ = fs::remove_dir_all(&output);
                return Err(error);
            }
        };
        let revision = Uuid::new_v4().to_string();
        task.revision = Some(revision.clone());
        task.previous = previous;
        Ok(json!({ "revision": revision, "card": card }))
    }

    pub async fn commit(
        &self,
        storage: &AppStorage,
        token: &str,
        revision: &str,
    ) -> CardResult<Value> {
        let mut tasks = self.tasks.lock().await;
        let task = tasks
            .get(token)
            .ok_or_else(|| GameCardError::new("导入任务已取消或已提交"))?;
        if task.revision.as_deref() != Some(revision)
            || task.created.elapsed() > Duration::from_secs(1800)
        {
            return Err(GameCardError::new("转换预览已失效，请重新转换"));
        }
        let task = tasks.remove(token).unwrap();
        crate::game_card_install::install_checked(
            storage,
            &task.input.root.join("output"),
            Some(task.previous.clone()),
        )
        .await
    }

    pub async fn cancel(&self, token: &str) {
        self.tasks.lock().await.remove(token);
    }
}
