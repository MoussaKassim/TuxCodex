use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    path: String,
    name: String,
}

fn valid_name(name: &str) -> bool {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.ends_with(['.', ' ']) {
        return false;
    }
    if name
        .chars()
        .any(|c| c.is_control() || "/\\:<>\"|?*".contains(c))
    {
        return false;
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    !matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn create_in(parent: &Path, name: &str) -> Result<CreatedProject, String> {
    let name = name.trim();
    if !valid_name(name) {
        return Err("Use a project name without path separators or reserved characters.".into());
    }
    let parent =
        std::fs::canonicalize(parent).map_err(|e| format!("Cannot open parent folder: {e}"))?;
    if !parent.is_dir() {
        return Err("The selected parent is not a folder.".into());
    }
    let path: PathBuf = parent.join(name);
    std::fs::create_dir(&path).map_err(|e| format!("Cannot create project folder: {e}"))?;
    Ok(CreatedProject {
        path: path.to_string_lossy().into_owned(),
        name: name.into(),
    })
}

#[tauri::command]
pub fn create_project(parent: String, name: String) -> Result<CreatedProject, String> {
    create_in(Path::new(&parent), &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_escape_and_reserved_names() {
        for name in [
            "",
            "..",
            "../escape",
            "foo/bar",
            "foo\\bar",
            "CON",
            "LPT1.txt",
            "bad:",
        ] {
            assert!(!valid_name(name), "accepted {name}");
        }
        assert!(valid_name("My Project"));
    }

    #[test]
    fn creates_only_new_child_directory() {
        let root =
            std::env::temp_dir().join(format!("tuxcodex-project-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let created = create_in(&root, "Sample").unwrap();
        assert!(Path::new(&created.path).is_dir());
        assert!(create_in(&root, "Sample").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
