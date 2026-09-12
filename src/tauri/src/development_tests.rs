use crate::development_commands::instructions;
use crate::project_init_tests::devkit;
use crate::tavern_test_support::TestDir;
use serde_json::Value;
use std::fs;
use std::path::Path;

fn copied_paths(text: &str) -> Value {
    serde_json::from_str(
        text.split("```json\n")
            .nth(1)
            .unwrap()
            .split("\n```")
            .next()
            .unwrap(),
    )
    .unwrap()
}

#[test]
fn development_instructions_point_to_documents_without_repeating_workflows() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let executable = temp.0.join("客户端 O'Brien.app/Contents/MacOS/client");
    let game_cards = temp.0.join("应用数据/game-cards");
    let text = instructions(&executable, &temp.0, &game_cards).unwrap();
    let paths = copied_paths(&text);
    assert_eq!(paths["executable"], executable.to_str().unwrap());
    assert_eq!(paths["gameCardsPath"], game_cards.to_str().unwrap());
    assert_eq!(paths.as_object().unwrap().len(), 5);
    for (field, file) in [
        ("guidePath", "development.md"),
        ("specIndexPath", "spec/README.md"),
        ("librariesIndexPath", "libs.md"),
    ] {
        assert_eq!(paths[field], kit.join(file).to_str().unwrap());
        assert!(Path::new(paths[field].as_str().unwrap()).is_file());
        assert!(text.split("```json").next().unwrap().contains(field));
    }
    assert!(text.starts_with("请先阅读 guidePath"));
    assert!(text.contains("按文档协助我开发当前项目"));
    assert_eq!(text.matches("```").count(), 2);
    for detail in [
        "--init-project",
        "--lib",
        "--dry-run",
        "--help",
        "trace.jsonl",
        ".wcs/development.md",
        "powershell",
    ] {
        assert!(!text.contains(detail), "{detail}");
    }
    let guide = fs::read_to_string(kit.join("development.md")).unwrap();
    for detail in [
        "--init-project",
        "--lib <库 ID>",
        "--dry-run",
        "--help",
        ".wcs/development.md",
        "warnings",
        "notChecked",
        "3 检查未完成",
        "不执行规则",
        "不生成 session 或 trace",
        "卡片图标开启开发者模式",
        "gameCardsPath",
        "active.json",
        "trace.jsonl",
        "sessions/index.json",
        "保留已有文件",
        "本机绝对路径",
        "提交 Git",
        "AppImage",
    ] {
        assert!(guide.contains(detail), "{detail}");
    }
    assert!(!game_cards.exists());
    assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 1);
}

#[test]
fn development_instructions_fail_clearly_for_missing_offline_resources() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    for file in ["development.md", "spec/README.md", "libs.md"] {
        let path = kit.join(file);
        let bytes = fs::read(&path).unwrap();
        fs::remove_file(&path).unwrap();
        let error = instructions(Path::new("/client"), &temp.0, &temp.0).unwrap_err();
        assert!(error.contains(file));
        assert!(error.contains("请重新安装客户端"));
        fs::write(path, bytes).unwrap();
    }
}

#[test]
fn development_instructions_preserve_windows_paths_as_json_data() {
    let temp = TestDir::new();
    devkit(&temp);
    let executable = r"C:\Program Files\O'Brien\世界站 $var `test`.exe";
    let game_cards = Path::new(r"C:\Users\开发者\AppData\Roaming\com.airp.chatapp\game-cards");
    let text = instructions(Path::new(executable), &temp.0, game_cards).unwrap();
    let paths = copied_paths(&text);
    assert_eq!(paths["executable"], executable);
    assert_eq!(paths["gameCardsPath"], game_cards.to_str().unwrap());
    assert!(!text.contains("```powershell"));
}

#[cfg(unix)]
#[test]
fn development_instructions_preserve_special_characters_without_shell_commands() {
    let temp = TestDir::new();
    let resources = temp
        .0
        .join("中文 O'Brien $(printf unexpected) `printf expanded` $PATH \"引号\"");
    fs::create_dir(&resources).unwrap();
    fs::rename(devkit(&temp), resources.join("devkit")).unwrap();
    let executable = resources.join("client");
    let game_cards = resources.join("data");
    let text = instructions(&executable, &resources, &game_cards).unwrap();
    let paths = copied_paths(&text);
    assert_eq!(paths["executable"], executable.to_str().unwrap());
    assert_eq!(paths["gameCardsPath"], game_cards.to_str().unwrap());
    assert_eq!(
        paths["guidePath"],
        resources.join("devkit/development.md").to_str().unwrap()
    );
    assert!(!text.contains("```sh"));
}

#[cfg(unix)]
#[test]
fn development_instructions_reject_unrepresentable_executable_paths() {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;
    let temp = TestDir::new();
    devkit(&temp);
    let executable = OsString::from_vec(vec![b'/', 0xff]);
    assert!(instructions(Path::new(&executable), &temp.0, &temp.0)
        .unwrap_err()
        .contains("UTF-8"));
}
