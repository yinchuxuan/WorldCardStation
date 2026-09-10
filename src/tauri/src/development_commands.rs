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
        cfg!(windows),
        &app.package_info().version.to_string(),
    )
}

pub(crate) fn instructions(
    executable: &Path,
    resources: &Path,
    windows: bool,
    version: &str,
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
        "platformVersion": version,
        "executable": executable,
        "devkitPath": devkit,
        "guidePath": Path::new(devkit).join("development.md"),
        "specIndexPath": Path::new(devkit).join("spec/README.md"),
        "librariesIndexPath": Path::new(devkit).join("libs.md")
    }))
    .map_err(|error| error.to_string())?;
    let command = launch_command(executable, windows);
    let shell = if windows { "powershell" } else { "sh" };
    Ok(format!(
        r#"请协助我在当前指定的游戏卡项目目录中开发 World Card Station 游戏卡。

以下是正在运行的客户端提供的本机信息，不需要平台源码、Node、npm 包或网络下载：
```json
{paths}
```

1. 先阅读 guidePath、specIndexPath 和 librariesIndexPath 对应的本地文档。DSL spec 是供你理解和查阅语法的文档。
2. 以我在 agent 工具中打开的游戏卡仓库作为工作目录；目标不明确时先向我确认，不要在客户端安装目录或开发包目录中开发。
3. 根据需求和 lib 索引选择库；若我指定了库，以我的选择为准。不需要世界书时不要复制世界书库。
4. 在项目工作目录中执行下面两条初始化命令之一，不要两条都执行。已有项目的文件必须保留；遇到冲突先说明，不删除文件重试。

不需要内置 lib：
```{shell}
{command} --init-project '.'
```

需要世界书 lib：
```{shell}
{command} --init-project '.' --lib worldbook
```

直接启动可执行文件并等待退出，读取 stdout 的 JSON 结果和退出码；不要使用打开应用的命令转交给已运行的窗口。
若使用不经过 shell 的进程工具，使用 executable 原始路径和参数数组 ["--init-project", "."]，按需追加 ["--lib", "worldbook"]。
检查返回的 created、preserved、warnings；成功后先阅读项目中的 .wcs/development.md，再按需查阅 .wcs/spec/ 和已复制 lib 的文档。

需要查看客户端用法时：
```{shell}
{command} --help
```

初始化只准备项目，不执行游戏卡规则、不调用模型、不生成 session 或 trace，也不代表语法检查通过。当前客户端尚未实现 --dry-run，不能声称已通过平台 dry-run。
本机可执行文件和开发包绝对路径只用于本次连接，不要写入 card.json、.wcs 文档或提交到 Git。项目中使用相对路径。
客户端移动或重新安装后，请重新从设置页复制指令。AppImage 的内置文档位于临时挂载目录，阅读期间请保持此客户端打开。
"#
    ))
}

pub(crate) fn launch_command(executable: &str, windows: bool) -> String {
    if windows {
        format!("& '{}'", executable.replace('\'', "''"))
    } else {
        format!("'{}'", executable.replace('\'', "'\"'\"'"))
    }
}
