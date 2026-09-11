use crate::game_card_error::GameCardError;
use crate::game_card_source_map::{locate, SourceMap};
use serde_json::{json, Value};
use std::path::Path;

pub fn report(root: &Path) -> Value {
    json!({
        "ok": true, "operation": "dry-run", "status": "valid", "projectPath": root.to_string_lossy(),
        "platformVersion": env!("CARGO_PKG_VERSION"),
        "schemaVersion": serde_json::from_str::<Value>(include_str!("../../shared/game-card/schema/game-card.schema.json")).unwrap()["x-schema-version"],
        "checked": [], "diagnostics": [], "warnings": [],
        "notChecked": [
            "不执行规则、JS 顶层代码、run(ctx) 或 UI 组件；不确认运行入口及返回值、变量值或分支行为。",
            "不检查动态路径、动态正则的最终值、脚本内部文件引用或 lib 配置业务约束。",
            "目录 scope 不枚举文件；未静态引用的条目不读取。CSS 外观和媒体解码不检查。"
        ]
    })
}

pub fn map_diagnostic(mut item: Value, sources: &SourceMap) -> Value {
    if item.get("file").is_none() || item["file"] == "card.json" {
        let pointer = item["pointer"].as_str().unwrap_or("");
        let location = locate(sources, pointer);
        item["file"] = json!(location.file);
        item["pointer"] = json!(location.pointer);
    }
    if let Some(reference) = item.get_mut("reference") {
        *reference = map_diagnostic(reference.take(), sources);
    }
    item
}

pub fn card_error(report: &mut Value, error: GameCardError, sources: &SourceMap) {
    let code = error.stage.as_deref().unwrap_or("card_load");
    let mut diagnostics = Vec::new();
    if error.details.is_empty() {
        diagnostics.push(json!({ "code": code, "message": error.error, "file": error.file.unwrap_or_else(|| "card.json".into()) }));
    } else {
        for detail in error.details {
            let mut item = serde_json::to_value(detail).unwrap();
            item["code"] = json!(code);
            diagnostics.push(map_diagnostic(item, sources));
        }
    }
    report["ok"] = json!(false);
    report["status"] = json!("invalid");
    report["diagnostics"] = json!(diagnostics);
}

pub fn failure(report: &mut Value, code: &str, message: impl ToString) {
    report["ok"] = json!(false);
    report["status"] = json!("failed");
    report["error"] = json!({ "code": code, "message": message.to_string() });
}

pub fn merge(report: &mut Value, result: Value, sources: &SourceMap) {
    if let Some(message) = result.get("failure") {
        failure(
            report,
            "checker_failed",
            message.as_str().unwrap_or("检查器失败"),
        );
        return;
    }
    for key in ["diagnostics", "warnings"] {
        let Some(items) = result[key].as_array() else {
            failure(report, "checker_failed", "检查器未返回完整诊断结果");
            return;
        };
        report[key] = json!(items
            .iter()
            .cloned()
            .map(|item| map_diagnostic(item, sources))
            .collect::<Vec<_>>());
    }
    let Some(checked) = result["checked"].as_array() else {
        failure(report, "checker_failed", "检查器未返回检查范围");
        return;
    };
    report["checked"]
        .as_array_mut()
        .unwrap()
        .extend(checked.iter().cloned());
    if !report["diagnostics"].as_array().unwrap().is_empty() {
        report["ok"] = json!(false);
        report["status"] = json!("invalid");
    }
}
