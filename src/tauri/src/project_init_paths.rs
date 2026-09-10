use crate::project_init_error::{InitError, InitResult};
use std::fs::{self, Metadata};
use std::path::{Component, Path, PathBuf};

pub fn metadata(path: &Path) -> InitResult<Option<Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            #[cfg(windows)]
            let linked = {
                use std::os::windows::fs::MetadataExt;
                meta.file_attributes() & 0x400 != 0 // Includes directory junctions.
            };
            #[cfg(not(windows))]
            let linked = meta.file_type().is_symlink();
            if linked || (!meta.is_dir() && !meta.is_file()) {
                return Err(InitError::new(
                    "unsafe_path",
                    format!("不支持链接或特殊文件：{}", path.display()),
                ));
            }
            Ok(Some(meta))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(InitError::io(path, error)),
    }
}

pub fn project_root(target: &Path) -> InitResult<PathBuf> {
    if target.as_os_str().is_empty() {
        return Err(InitError::new("invalid_arguments", "项目目录不能为空"));
    }
    let absolute = std::path::absolute(target).map_err(|error| InitError::io(target, error))?;
    // Resolve an existing ancestor once; OS aliases such as macOS /var remain usable.
    let mut ancestor = absolute.as_path();
    let mut missing = Vec::new();
    loop {
        if let Some(meta) = metadata(ancestor)? {
            if !meta.is_dir() {
                return Err(InitError::new(
                    "path_conflict",
                    format!("不是目录：{}", ancestor.display()),
                ));
            }
            break;
        }
        missing.push(
            ancestor
                .file_name()
                .ok_or_else(|| InitError::new("unsafe_path", "无效项目目录"))?,
        );
        ancestor = ancestor
            .parent()
            .ok_or_else(|| InitError::new("unsafe_path", "无效项目目录"))?;
    }
    let mut root = ancestor
        .canonicalize()
        .map_err(|error| InitError::io(ancestor, error))?;
    for name in missing.into_iter().rev() {
        root.push(name);
    }
    if root.to_str().is_none() {
        return Err(InitError::new(
            "invalid_arguments",
            "项目目录必须可表示为 UTF-8 路径",
        ));
    }
    if root.parent().is_none() {
        return Err(InitError::new(
            "unsafe_path",
            "不能在文件系统根目录初始化游戏卡",
        ));
    }
    Ok(root)
}

pub fn check(root: &Path, relative: &str, directory: bool) -> InitResult<bool> {
    if relative.is_empty()
        || relative.contains(['\\', ':'])
        || relative.split('/').any(|part| part.is_empty())
    {
        return Err(InitError::new(
            "unsafe_path",
            format!("无效相对路径：{relative}"),
        ));
    }
    if Path::new(relative)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(InitError::new(
            "unsafe_path",
            format!("路径超出项目：{relative}"),
        ));
    }
    let mut path = root.to_path_buf();
    // Recheck all ancestors at every write, including newly created project parents.
    for ancestor in root.ancestors() {
        if metadata(ancestor)?.is_some_and(|meta| !meta.is_dir()) {
            return Err(InitError::new(
                "path_conflict",
                format!("不是目录：{}", ancestor.display()),
            ));
        }
    }
    let parts: Vec<_> = relative.split('/').collect();
    for (index, part) in parts.iter().enumerate() {
        path.push(part);
        if let Some(meta) = metadata(&path)? {
            let expect_dir = index + 1 < parts.len() || directory;
            if meta.is_dir() != expect_dir {
                return Err(InitError::new(
                    "path_conflict",
                    format!("文件与目录冲突：{}", path.display()),
                ));
            }
            if index + 1 == parts.len() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
