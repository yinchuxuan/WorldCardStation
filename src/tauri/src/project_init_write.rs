use crate::project_init_error::{InitError, InitResult};
use crate::project_init_paths::{check, metadata};
use std::fs::{self, Metadata, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const INIT_LOCK: &str = ".wcs-init.lock";

struct CreatedFile {
    path: String,
    bytes: Vec<u8>,
    metadata: Metadata,
}

pub struct Writer {
    root: PathBuf,
    files: Vec<CreatedFile>,
    directories: Vec<PathBuf>,
}

fn unchanged(before: &Metadata, after: &Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != after.dev() || before.ino() != after.ino() {
            return false;
        }
    }
    before.len() == after.len() && before.modified().ok() == after.modified().ok()
}

fn remove_created(root: &Path, created: &CreatedFile) -> bool {
    let path = root.join(&created.path);
    check(root, &created.path, false).unwrap_or(false)
        && metadata(&path)
            .ok()
            .flatten()
            .is_some_and(|meta| unchanged(&created.metadata, &meta))
        && fs::read(&path).ok().as_ref() == Some(&created.bytes)
        && fs::remove_file(&path).is_ok()
}

impl Writer {
    pub fn new(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            files: Vec::new(),
            directories: Vec::new(),
        }
    }

    fn mkdir(&mut self, path: &Path) -> InitResult<()> {
        if let Some(meta) = metadata(path)? {
            if meta.is_dir() {
                return Ok(());
            }
            return Err(InitError::new(
                "path_conflict",
                format!("不是目录：{}", path.display()),
            ));
        }
        if let Some(parent) = path.parent() {
            self.mkdir(parent)?;
        }
        fs::create_dir(path).map_err(|error| InitError::io(path, error))?;
        self.directories.push(path.to_path_buf());
        Ok(())
    }

    pub fn directory(&mut self, relative: &str) -> InitResult<()> {
        check(&self.root, relative, true)?;
        self.mkdir(&self.root.join(relative))
    }

    pub fn lock(&mut self) -> InitResult<()> {
        if check(&self.root, INIT_LOCK, false)? {
            return Err(InitError::new(
                "project_busy",
                "项目存在 .wcs-init.lock；请等待另一次初始化完成，或确认没有初始化进程后清理遗留锁",
            ));
        }
        self.file(INIT_LOCK, uuid::Uuid::new_v4().to_string().as_bytes())
    }

    pub fn unlock(&mut self) -> InitResult<()> {
        let index = self
            .files
            .iter()
            .position(|file| file.path == INIT_LOCK)
            .unwrap();
        if !remove_created(&self.root, &self.files[index]) {
            return Err(InitError::new(
                "concurrent_change",
                "初始化锁已被改动或无法删除",
            ));
        }
        self.files.remove(index);
        Ok(())
    }

    pub fn file(&mut self, relative: &str, bytes: &[u8]) -> InitResult<()> {
        if check(&self.root, relative, false)? {
            return Err(InitError::new(
                "concurrent_change",
                format!("初始化期间文件已出现：{relative}"),
            ));
        }
        let path = self.root.join(relative);
        self.mkdir(path.parent().unwrap())?;
        check(&self.root, relative, false)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| InitError::io(&path, error))?;
        let mut written = 0;
        let result = (|| {
            while written < bytes.len() {
                match file.write(&bytes[written..]) {
                    Ok(0) => {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::WriteZero,
                            "incomplete initialization write",
                        ))
                    }
                    Ok(count) => written += count,
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(error) => return Err(error),
                }
            }
            file.sync_all()
        })();
        let meta = file.metadata().map_err(|cause| {
            let mut error = InitError::io(&path, cause);
            error.retained_paths.push(path.display().to_string());
            error
        })?;
        // Keep only our own written bytes, never adopt a concurrent editor's content.
        self.files.push(CreatedFile {
            path: relative.into(),
            bytes: bytes[..written].to_vec(),
            metadata: meta,
        });
        result.map_err(|error| InitError::io(&path, error))
    }

    pub fn rollback(self, error: &mut InitError) {
        for created in self.files.into_iter().rev() {
            let path = self.root.join(&created.path);
            if !remove_created(&self.root, &created) {
                error.retained_paths.push(path.display().to_string());
            }
        }
        for path in self.directories.into_iter().rev() {
            // Never recursively remove a directory: another process may have added content.
            let safe = path.ancestors().all(|parent| {
                metadata(parent)
                    .ok()
                    .flatten()
                    .is_some_and(|meta| meta.is_dir())
            });
            if !safe || fs::remove_dir(&path).is_err() {
                error.retained_paths.push(path.display().to_string());
            }
        }
    }
}
