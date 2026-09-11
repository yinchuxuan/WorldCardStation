use crate::development_commands::{instructions, launch_command};
use crate::project_init_tests::devkit;
use crate::tavern_test_support::TestDir;
use serde_json::Value;
use std::fs;
use std::path::Path;

#[test]
fn development_instructions_use_supplied_paths_and_existing_offline_documents() {
    let temp = TestDir::new();
    let kit = devkit(&temp);
    let executable = temp.0.join("客户端 O'Brien.app/Contents/MacOS/client");
    let text = instructions(&executable, &temp.0, false, "1.2.3").unwrap();
    let paths: Value = serde_json::from_str(
        text.split("```json\n")
            .nth(1)
            .unwrap()
            .split("\n```")
            .next()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(paths["executable"], executable.to_str().unwrap());
    assert_eq!(paths["platformVersion"], "1.2.3");
    assert_eq!(paths["devkitPath"], kit.to_str().unwrap());
    for field in ["guidePath", "specIndexPath", "librariesIndexPath"] {
        assert!(Path::new(paths[field].as_str().unwrap()).is_file());
    }
    let command = launch_command(executable.to_str().unwrap(), false);
    assert!(text.contains(&format!("{command} --init-project '.'\n")));
    assert!(text.contains(&format!("{command} --init-project '.' --lib worldbook")));
    assert!(text.contains(&format!("{command} --help")));
    assert!(text.contains(".wcs/development.md"));
    assert!(text.contains("不要写入 card.json"));
    assert!(text.contains("已有项目的文件必须保留"));
    assert!(text.contains(&format!("{command} --dry-run '.'")));
    assert!(text.contains("notChecked"));
    assert!(text.contains("3 表示检查未完成"));
    assert!(text.contains("保持此客户端打开"));
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
        let error = instructions(Path::new("/client"), &temp.0, false, "1").unwrap_err();
        assert!(error.contains(file));
        assert!(error.contains("请重新安装客户端"));
        fs::write(path, bytes).unwrap();
    }
}

#[test]
fn development_windows_commands_use_powershell_call_operator_and_literal_quotes() {
    let temp = TestDir::new();
    devkit(&temp);
    let executable = r"C:\Program Files\O'Brien\世界站 $var `test`.exe";
    let command = r"& 'C:\Program Files\O''Brien\世界站 $var `test`.exe'";
    assert_eq!(launch_command(executable, true), command);
    let text = instructions(Path::new(executable), &temp.0, true, "1").unwrap();
    assert!(text.contains(&format!("```powershell\n{command} --init-project '.'")));
}

#[cfg(unix)]
#[test]
fn development_posix_quoting_round_trips_without_shell_expansion() {
    let executable =
        "/Applications/中文 O'Brien $(printf unexpected) `printf expanded` $PATH/client";
    let output = std::process::Command::new("/bin/sh")
        .args([
            "-c",
            &format!("printf '%s' {}", launch_command(executable, false)),
        ])
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8(output.stdout).unwrap(), executable);
}

#[cfg(unix)]
#[test]
fn development_instructions_reject_unrepresentable_executable_paths() {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;
    let temp = TestDir::new();
    devkit(&temp);
    let executable = OsString::from_vec(vec![b'/', 0xff]);
    assert!(instructions(Path::new(&executable), &temp.0, false, "1")
        .unwrap_err()
        .contains("UTF-8"));
}
