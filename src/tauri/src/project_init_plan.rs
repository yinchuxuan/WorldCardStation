use crate::project_init_assets::{read, tree, Files};
use crate::project_init_error::{InitError, InitResult};
use crate::project_init_paths::check;
use serde_json::{json, Value};
use std::path::Path;
use uuid::Uuid;

pub struct Plan {
    pub files: Files,
    pub directories: Vec<String>,
    pub preserved: Vec<String>,
    pub warnings: Vec<String>,
    pub card_id: Option<String>,
}

fn preserve_group(root: &Path, prefix: &str, plan: &mut Plan) -> InitResult<()> {
    if !check(root, prefix.trim_end_matches('/'), true)? {
        return Ok(());
    }
    let mut has_managed_files = false;
    for path in plan.files.keys().filter(|path| path.starts_with(prefix)) {
        has_managed_files |= check(root, path, false)?;
    }
    let has_entries = std::fs::read_dir(root.join(prefix))
        .map_err(|error| InitError::io(&root.join(prefix), error))?
        .next()
        .transpose()
        .map_err(|error| InitError::io(&root.join(prefix), error))?
        .is_some();
    // Unrelated .wcs notes do not prevent installing a complete documentation snapshot.
    if has_managed_files || (prefix != ".wcs/" && has_entries) {
        if prefix == ".wcs/" && !check(root, ".wcs/development.md", false)? {
            return Err(InitError::new("path_conflict", "已有部分 .wcs 开发资料但缺少 development.md；请先整理该目录，初始化不会混合资料版本"));
        }
        plan.files.retain(|path, _| !path.starts_with(prefix));
        plan.preserved.push(prefix.to_string());
        plan.warnings.push(format!(
            "保留已有 {prefix}，初始化不会更新或混合不同版本；请按需单独审阅更新。"
        ));
    }
    Ok(())
}

pub fn create(devkit: &Path, root: &Path, worldbook: bool) -> InitResult<Plan> {
    let mut plan = Plan {
        files: Files::new(),
        directories: Vec::new(),
        preserved: Vec::new(),
        warnings: Vec::new(),
        card_id: None,
    };
    for name in ["development.md", "libs.md"] {
        plan.files
            .insert(format!(".wcs/{name}"), read(devkit, name)?);
    }
    tree(devkit, "spec", ".wcs/spec/", &mut plan.files)?;
    let existing_card = check(root, "card.json", false)?;
    let mut card: Value = if existing_card {
        let bytes = std::fs::read(root.join("card.json"))
            .map_err(|error| InitError::io(&root.join("card.json"), error))?;
        plan.preserved.push("card.json".into());
        // Initialization must also work in an unfinished card project, without executing imports.
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    } else {
        let mut template: Value =
            serde_json::from_slice(&read(devkit, "templates/minimal/card.json")?)
                .map_err(|error| InitError::new("invalid_devkit", error.to_string()))?;
        if !template.is_object() || !template["rules"].is_array() {
            return Err(InitError::new("invalid_devkit", "最小卡模板结构错误"));
        }
        template["id"] = Uuid::new_v4().to_string().into();
        template
    };
    plan.card_id = card["id"].as_str().map(str::to_string);
    if worldbook {
        tree(
            devkit,
            "libs/worldbook-library/lib/worldbook",
            "lib/worldbook/",
            &mut plan.files,
        )?;
        for name in ["README.md", "SEMANTICS.md"] {
            plan.files.insert(
                format!("lib/worldbook/{name}"),
                read(devkit, &format!("libs/worldbook-library/{name}"))?,
            );
        }
        if !existing_card {
            for directory in ["worldbook", "lib/worldbook"] {
                if check(root, directory, true)? {
                    return Err(InitError::new(
                        "path_conflict",
                        format!("新卡需要未占用的 {directory}/，已有内容不会覆盖"),
                    ));
                }
            }
            card["files"] = json!({ "worldbook": { "directory": "worldbook", "include": ["config.json", "entries/*.md"] } });
            card["rules"].as_array_mut().unwrap().push(json!({
                "id": "worldbook", "when": { "phase": "pre_send" },
                "then": [{ "type": "exec", "sourceFile": "lib/worldbook/index.js", "args": { "worldbook": "worldbook" } }]
            }));
        } else {
            plan.warnings.push("已有 card.json 未改写；请阅读 lib/worldbook/README.md，确认世界书配置、目录 scope 和 exec 接入。".into());
        }
        preserve_group(root, "lib/worldbook/", &mut plan)?;
        plan.files.insert("worldbook/config.json".into(), b"{\n  \"name\": \"main\",\n  \"scan_depth\": 4,\n  \"token_budget\": 2048,\n  \"entries\": []\n}\n".to_vec());
        plan.directories.push("worldbook/entries".into());
    }
    if !existing_card {
        let mut bytes = serde_json::to_vec_pretty(&card)
            .map_err(|error| InitError::new("invalid_devkit", error.to_string()))?;
        bytes.push(b'\n');
        plan.files.insert("card.json".into(), bytes);
    }
    preserve_group(root, ".wcs/", &mut plan)?;
    // Inspect every destination before creating any files or directories.
    let mut existing = Vec::new();
    for relative in plan.files.keys() {
        if check(root, relative, false)? {
            existing.push(relative.clone());
        }
    }
    for path in existing {
        plan.files.remove(&path);
        plan.preserved.push(path);
    }
    for relative in &plan.directories {
        check(root, relative, true)?;
    }
    Ok(plan)
}
