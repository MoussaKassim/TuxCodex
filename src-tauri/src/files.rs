use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewFile {
    path: String,
    name: String,
    kind: String,
    data_url: Option<String>,
    text: Option<String>,
}

fn resolve_file(cwd: &str, requested: &str) -> Result<PathBuf, String> {
    let root = std::fs::canonicalize(cwd).map_err(|e| format!("Cannot open workspace: {e}"))?;
    if !root.is_dir() {
        return Err("Workspace is not a folder.".into());
    }
    let requested = requested.trim();
    if requested.is_empty() {
        return Err("No file path was provided.".into());
    }
    let input = Path::new(requested);
    let target = std::fs::canonicalize(if input.is_absolute() {
        input.to_path_buf()
    } else {
        root.join(input)
    })
    .map_err(|e| format!("Cannot open file: {e}"))?;
    if !target.starts_with(&root) {
        return Err("File is outside the active workspace.".into());
    }
    if !target.is_file() {
        return Err("This path is not a file.".into());
    }
    Ok(target)
}

fn detect_kind(path: &Path, bytes: &[u8]) -> Result<(&'static str, &'static str), String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok(("image", "image/png")),
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Ok(("image", "image/jpeg")),
        "webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            Ok(("image", "image/webp"))
        }
        "svg"
            if std::str::from_utf8(bytes).ok().is_some_and(|text| {
                text.trim_start().starts_with("<svg") || text.trim_start().starts_with("<?xml")
            }) =>
        {
            Ok(("image", "image/svg+xml"))
        }
        "pdf" if bytes.starts_with(b"%PDF-") => Ok(("pdf", "application/pdf")),
        "html" | "htm" if std::str::from_utf8(bytes).is_ok() => Ok(("html", "text/html")),
        "txt" | "md" | "json" | "csv" | "log" if std::str::from_utf8(bytes).is_ok() => {
            Ok(("text", "text/plain"))
        }
        _ => Err("Preview supports PNG, JPEG, WebP, SVG, PDF, HTML, and text files.".into()),
    }
}

fn preview(cwd: &str, requested: &str) -> Result<PreviewFile, String> {
    let path = resolve_file(cwd, requested)?;
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > 20 * 1024 * 1024 {
        return Err("File is too large to preview (20 MB limit).".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (kind, mime) = detect_kind(&path, &bytes)?;
    let text = if matches!(kind, "html" | "text") {
        Some(String::from_utf8(bytes.clone()).map_err(|e| e.to_string())?)
    } else {
        None
    };
    let data_url = if text.is_none() {
        Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    } else {
        None
    };
    Ok(PreviewFile {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        kind: kind.into(),
        data_url,
        text,
    })
}

#[tauri::command]
pub fn preview_file(cwd: String, path: String) -> Result<PreviewFile, String> {
    preview(&cwd, &path)
}

#[tauri::command]
pub fn open_workspace_file(
    app: AppHandle,
    cwd: String,
    path: String,
    reveal: bool,
) -> Result<(), String> {
    let path = resolve_file(&cwd, &path)?;
    if reveal {
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn copy_workspace_file(cwd: String, path: String, destination: String) -> Result<(), String> {
    let source = resolve_file(&cwd, &path)?;
    let destination = Path::new(&destination);
    if destination.exists() {
        return Err("Destination already exists; choose another name.".into());
    }
    let mut input = std::fs::File::open(source).map_err(|e| e.to_string())?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|e| e.to_string())?;
    if let Err(error) = std::io::copy(&mut input, &mut output) {
        drop(output);
        let _ = std::fs::remove_file(destination);
        return Err(error.to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_paths_outside_workspace() {
        let root =
            std::env::temp_dir().join(format!("tuxcodex-preview-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("note.txt"), "hello").unwrap();
        assert!(resolve_file(root.to_str().unwrap(), "note.txt").is_ok());
        assert!(resolve_file(root.to_str().unwrap(), "../elsewhere.txt").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn preview_detects_content_not_only_extension() {
        assert!(detect_kind(Path::new("file.pdf"), b"not a PDF").is_err());
        assert!(detect_kind(Path::new("file.pdf"), b"%PDF-1.7").is_ok());
    }
}
