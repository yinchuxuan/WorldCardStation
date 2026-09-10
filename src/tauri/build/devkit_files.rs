use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Component, Path};

pub type Files = BTreeMap<String, Vec<u8>>;

pub fn read_tree(root: &Path, prefix: &str, files: &mut Files) -> io::Result<()> {
    if !fs::symlink_metadata(root)?.file_type().is_dir() {
        return Err(io::Error::other(format!(
            "devkit: expected a real directory: {}",
            root.display()
        )));
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let name = entry.file_name().into_string().map_err(|_| {
            io::Error::other(format!("devkit: non-UTF-8 path in {}", root.display()))
        })?;
        let relative = format!("{prefix}{name}");
        if kind.is_dir() {
            read_tree(&entry.path(), &format!("{relative}/"), files)?;
        } else if kind.is_file() {
            files.insert(relative, fs::read(entry.path())?);
        } else {
            return Err(io::Error::other(format!(
                "devkit: unsupported file {relative}"
            )));
        }
    }
    Ok(())
}

pub fn offline_markdown(text: &str) -> io::Result<String> {
    let mut result = String::new();
    let mut omit = false;
    for line in text.lines() {
        match line {
            "<!-- devkit:omit:start -->" if !omit => omit = true,
            "<!-- devkit:omit:end -->" if omit => omit = false,
            line if line.starts_with("<!-- devkit:omit:") => {
                return Err(io::Error::other("devkit: invalid omission markers"));
            }
            _ if omit => {}
            _ => {
                result.push_str(line);
                result.push('\n');
            }
        }
    }
    if omit {
        return Err(io::Error::other("devkit: unclosed omission marker"));
    }
    Ok(result)
}

fn relative_link(file: &str, target: &str) -> io::Result<String> {
    let mut parts = Vec::new();
    let joined = Path::new(file).parent().unwrap().join(target);
    for part in joined.components() {
        match part {
            Component::Normal(value) => parts.push(value.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir if !parts.is_empty() => {
                parts.pop();
            }
            _ => {
                return Err(io::Error::other(format!(
                    "devkit: unsafe link in {file}: {target}"
                )))
            }
        }
    }
    Ok(parts.join("/"))
}

pub fn validate_links(files: &Files) -> io::Result<()> {
    for (file, bytes) in files.iter().filter(|(file, _)| file.ends_with(".md")) {
        let text = std::str::from_utf8(bytes).map_err(io::Error::other)?;
        for part in text.split("](").skip(1) {
            let target = part.split(')').next().unwrap();
            if target.starts_with("https://") || target.starts_with("http://") {
                continue;
            }
            let target = target.split('#').next().unwrap();
            if target.is_empty() {
                continue;
            }
            if !files.contains_key(&relative_link(file, target)?) {
                return Err(io::Error::other(format!(
                    "devkit: broken link in {file}: {target}"
                )));
            }
        }
    }
    Ok(())
}

pub fn write_bundle(output: &Path, files: &Files) -> io::Result<()> {
    // Only the build-owned generated directory is reconciled; never a card project.
    if output.exists() {
        let mut previous = Files::new();
        read_tree(output, "", &mut previous)?;
        for old in previous.keys().filter(|file| !files.contains_key(*file)) {
            fs::remove_file(output.join(old))?;
        }
    }
    for (relative, bytes) in files {
        let path = output.join(relative);
        if fs::read(&path).ok().as_ref() == Some(bytes) {
            continue;
        }
        fs::create_dir_all(path.parent().unwrap())?;
        fs::write(path, bytes)?;
    }
    Ok(())
}
