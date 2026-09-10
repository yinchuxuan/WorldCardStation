use crate::project_init_error::{InitError, InitResult};
use crate::project_init_paths::project_root;
use crate::project_init_plan;
use crate::project_init_write::Writer;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitReport {
    pub project_path: String,
    pub guide_path: String,
    pub card_id: Option<String>,
    pub created: Vec<String>,
    pub preserved: Vec<String>,
    pub warnings: Vec<String>,
    pub next: &'static str,
}

pub fn initialize(devkit: &Path, target: &Path, libraries: &[String]) -> InitResult<InitReport> {
    if let Some(unknown) = libraries.iter().find(|name| name.as_str() != "worldbook") {
        return Err(InitError::new(
            "unknown_library",
            format!("不支持的内置 lib：{unknown}"),
        ));
    }
    let root = project_root(target)?;
    let devkit = devkit
        .canonicalize()
        .map_err(|error| InitError::io(devkit, error))?;
    if root.starts_with(&devkit) || devkit.starts_with(&root) {
        return Err(InitError::new(
            "unsafe_path",
            "不能在客户端开发包目录或其父目录初始化项目",
        ));
    }
    project_init_plan::create(&devkit, &root, !libraries.is_empty())?;
    let mut writer = Writer::new(&root);
    let result = (|| {
        writer.lock()?;
        // Re-plan under the project lock so another initialization cannot observe partial output.
        let plan = project_init_plan::create(&devkit, &root, !libraries.is_empty())?;
        for relative in &plan.directories {
            writer.directory(relative)?;
        }
        // Publish the card entry last, after all of its resources exist.
        for (relative, bytes) in plan
            .files
            .iter()
            .filter(|(path, _)| path.as_str() != "card.json")
        {
            writer.file(relative, bytes)?;
        }
        if let Some(card) = plan.files.get("card.json") {
            writer.file("card.json", card)?;
        }
        writer.unlock()?;
        Ok(plan)
    })();
    let plan = match result {
        Ok(plan) => plan,
        Err(mut error) => {
            writer.rollback(&mut error);
            return Err(error);
        }
    };
    Ok(InitReport {
        project_path: root.display().to_string(),
        guide_path: root.join(".wcs/development.md").display().to_string(),
        card_id: plan.card_id,
        created: plan.files.into_keys().collect(),
        preserved: plan.preserved,
        warnings: plan.warnings,
        next: "先阅读项目中的 .wcs/development.md，按其中的流程开发游戏卡。初始化不是语法检查或实际游玩验证。",
    })
}
