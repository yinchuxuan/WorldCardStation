use serde_json::json;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub fn get_game_card_development_instructions(app: tauri::AppHandle) -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    // AppImage's mounted executable disappears on exit; launch the original AppImage instead.
    #[cfg(target_os = "linux")]
    let executable = match app.env().appimage {
        Some(path) => std::path::PathBuf::from(path)
            .canonicalize()
            .map_err(|error| error.to_string())?,
        None => executable,
    };
    let resources = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    instructions(
        &executable,
        &resources,
        &app.state::<crate::app_storage::AppStorage>()
            .game_cards_dir(),
    )
}

pub(crate) fn instructions(
    executable: &Path,
    resources: &Path,
    game_cards: &Path,
) -> Result<String, String> {
    let devkit = resources.join("devkit");
    for file in ["development.md", "spec/README.md", "libs.md"] {
        if !devkit.join(file).is_file() {
            return Err(format!(
                "客户端开发包不完整，缺少 {}；请重新安装客户端",
                devkit.join(file).display()
            ));
        }
    }
    let executable = executable.to_str().ok_or("客户端路径不是有效的 UTF-8")?;
    let devkit = devkit.to_str().ok_or("开发包路径不是有效的 UTF-8")?;
    let paths = serde_json::to_string_pretty(&json!({
        "executable": executable,
        "gameCardsPath": game_cards,
        "guidePath": Path::new(devkit).join("development.md"),
        "specIndexPath": Path::new(devkit).join("spec/README.md"),
        "librariesIndexPath": Path::new(devkit).join("libs.md")
    }))
    .map_err(|error| error.to_string())?;
    Ok(format!(
        r#"请先阅读 guidePath 对应的游戏卡开发指南，按文档协助我开发当前项目；按需查阅 specIndexPath（DSL spec）和 librariesIndexPath（lib 索引）。

本机路径：
```json
{paths}
```
"#
    ))
}
