use crate::project_init_error::{InitError, InitResult};
use crate::project_init_paths::{check, metadata};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub type Files = BTreeMap<String, Vec<u8>>;

pub fn read(root: &Path, relative: &str) -> InitResult<Vec<u8>> {
    if !check(root, relative, false)? {
        return Err(InitError::new(
            "missing_devkit",
            format!("开发包缺少文件：{relative}"),
        ));
    }
    fs::read(root.join(relative)).map_err(|error| InitError::io(&root.join(relative), error))
}

pub fn tree(root: &Path, relative: &str, prefix: &str, files: &mut Files) -> InitResult<()> {
    if !check(root, relative, true)? {
        return Err(InitError::new(
            "missing_devkit",
            format!("开发包缺少目录：{relative}"),
        ));
    }
    let path = root.join(relative);
    for entry in fs::read_dir(&path).map_err(|error| InitError::io(&path, error))? {
        let entry = entry.map_err(|error| InitError::io(&path, error))?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| InitError::new("unsafe_path", "开发包文件名不是 UTF-8"))?;
        let source = format!("{relative}/{name}");
        let target = format!("{prefix}{name}");
        if metadata(&entry.path())?.is_some_and(|meta| meta.is_dir()) {
            tree(root, &source, &format!("{target}/"), files)?;
        } else {
            files.insert(target, read(root, &source)?);
        }
    }
    Ok(())
}
