use crate::project_init::initialize;
use crate::project_init_error::{InitError, InitResult};
use serde_json::{json, Value};
use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
pub enum Request {
    Help,
    Init {
        target: PathBuf,
        libraries: Vec<String>,
    },
}

pub fn parse(args: Vec<OsString>) -> InitResult<Option<Request>> {
    if args.is_empty() || (args.len() == 1 && args[0].to_string_lossy().starts_with("-psn_")) {
        return Ok(None);
    }
    if args.len() == 1 && args[0] == "--help" {
        return Ok(Some(Request::Help));
    }
    let mut args = args.into_iter();
    let mut target = None;
    let mut libraries = Vec::new();
    while let Some(flag) = args.next() {
        if flag != "--init-project" && flag != "--lib" {
            return Err(InitError::new(
                "invalid_arguments",
                format!("未知参数：{}；使用 --help 查看用法", flag.to_string_lossy()),
            ));
        }
        let value = args
            .next()
            .filter(|value| !value.is_empty() && !value.to_string_lossy().starts_with("--"))
            .ok_or_else(|| {
                InitError::new(
                    "invalid_arguments",
                    format!("{} 缺少参数值", flag.to_string_lossy()),
                )
            })?;
        if flag == "--init-project" {
            if target.replace(PathBuf::from(value)).is_some() {
                return Err(InitError::new(
                    "invalid_arguments",
                    "--init-project 只能指定一次",
                ));
            }
        } else {
            let name = value
                .into_string()
                .map_err(|_| InitError::new("invalid_arguments", "lib 名称必须是 UTF-8"))?;
            if !libraries.contains(&name) {
                libraries.push(name);
            }
        }
    }
    let target =
        target.ok_or_else(|| InitError::new("invalid_arguments", "缺少 --init-project <目录>"))?;
    Ok(Some(Request::Init { target, libraries }))
}

fn execute(request: Request, package: &tauri::utils::PackageInfo) -> InitResult<Value> {
    let resource_dir = tauri::utils::platform::resource_dir(package, &tauri::Env::default())
        .map_err(|error| InitError::new("missing_devkit", error.to_string()))?;
    let devkit = resource_dir.join("devkit");
    match request {
        Request::Help => Ok(json!({
            "usage": "client --init-project <directory> [--lib worldbook]",
            "devkitPath": devkit, "guidePath": devkit.join("development.md"),
            "commands": ["--init-project", "--help"], "libraries": ["worldbook"]
        })),
        Request::Init { target, libraries } => {
            initialize(&devkit, &target, &libraries).and_then(|report| {
                serde_json::to_value(report)
                    .map_err(|error| InitError::new("output_error", error.to_string()))
            })
        }
    }
}

pub fn run(package: &tauri::utils::PackageInfo) -> Option<i32> {
    let parsed = parse(std::env::args_os().skip(1).collect());
    if matches!(parsed, Ok(None)) {
        return None;
    }
    attach_console();
    let operation = if matches!(parsed, Ok(Some(Request::Help))) {
        "help"
    } else {
        "init-project"
    };
    let result = parsed.and_then(|request| execute(request.unwrap(), package));
    let status = match &result {
        Ok(_) => 0,
        Err(error) if error.code == "invalid_arguments" || error.code == "unknown_library" => 2,
        Err(_) => 1,
    };
    let mut output = json!({ "ok": result.is_ok(), "operation": operation, "platformVersion": package.version.to_string() });
    match result {
        Ok(Value::Object(fields)) => output.as_object_mut().unwrap().extend(fields),
        Ok(_) => unreachable!(),
        Err(error) => output["error"] = serde_json::to_value(error).unwrap(),
    }
    let mut stdout = std::io::stdout().lock();
    if writeln!(stdout, "{output}")
        .and_then(|_| stdout.flush())
        .is_err()
    {
        return Some(1);
    }
    Some(status)
}

#[cfg(not(windows))]
fn attach_console() {}

#[cfg(windows)]
fn attach_console() {
    // GUI-subsystem builds still return JSON to parent consoles and captured agent pipes.
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
        fn GetStdHandle(kind: u32) -> isize;
        fn SetStdHandle(kind: u32, handle: isize) -> i32;
    }
    unsafe {
        let handles = [(-11i32) as u32, (-12i32) as u32].map(|kind| (kind, GetStdHandle(kind)));
        AttachConsole(u32::MAX);
        for (kind, handle) in handles {
            if handle != 0 && handle != -1 {
                SetStdHandle(kind, handle);
            }
        }
    }
}
