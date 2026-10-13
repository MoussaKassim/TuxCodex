use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
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
        "svg" if is_svg(bytes) => Ok(("image", "image/svg+xml")),
        "pdf" if bytes.starts_with(b"%PDF-") => Ok(("pdf", "application/pdf")),
        "html" | "htm" if std::str::from_utf8(bytes).is_ok() => Ok(("html", "text/html")),
        "txt" | "md" | "json" | "csv" | "log" if std::str::from_utf8(bytes).is_ok() => {
            Ok(("text", "text/plain"))
        }
        _ => Err("Preview supports PNG, JPEG, WebP, SVG, PDF, HTML, and text files.".into()),
    }
}

fn is_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let mut document = text.trim_start_matches('\u{feff}').trim_start();
    if document.starts_with("<?xml") {
        let Some(end) = document.find("?>") else {
            return false;
        };
        document = document[end + 2..].trim_start();
    }
    while document.starts_with("<!--") {
        let Some(end) = document.find("-->") else {
            return false;
        };
        document = document[end + 3..].trim_start();
    }
    document.strip_prefix("<svg").is_some_and(|tail| {
        tail.starts_with(char::is_whitespace) || tail.starts_with('>') || tail.starts_with('/')
    })
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
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "tuxcodex-file-test-{}-{}",
                std::process::id(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn resolves_workspace_files_and_rejects_real_files_outside() {
        let fixture = Fixture::new();
        let workspace = fixture.0.join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        std::fs::write(workspace.join("note.txt"), "hello").unwrap();
        std::fs::write(fixture.0.join("secret.txt"), "private").unwrap();
        assert!(resolve_file(workspace.to_str().unwrap(), "note.txt").is_ok());
        assert!(resolve_file(workspace.to_str().unwrap(), "../secret.txt").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(fixture.0.join("secret.txt"), workspace.join("linked.txt"))
                .unwrap();
            assert!(resolve_file(workspace.to_str().unwrap(), "linked.txt").is_err());
        }
    }

    #[test]
    fn preview_detects_content_not_only_extension() {
        assert!(detect_kind(Path::new("file.pdf"), b"not a PDF").is_err());
        assert!(detect_kind(Path::new("file.pdf"), b"%PDF-1.7").is_ok());
        assert!(detect_kind(Path::new("file.svg"), b"<?xml version='1.0'?><script/>").is_err());
        assert!(detect_kind(
            Path::new("file.svg"),
            b"<?xml version='1.0'?><!--art--><svg viewBox='0 0 1 1'/>"
        )
        .is_ok());
    }

    #[test]
    fn previews_images_and_html_from_a_workspace() {
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("chart.png"), b"\x89PNG\r\n\x1a\ncontent").unwrap();
        let image = preview(fixture.0.to_str().unwrap(), "chart.png").unwrap();
        assert_eq!(image.kind, "image");
        assert!(image
            .data_url
            .unwrap()
            .starts_with("data:image/png;base64,"));

        std::fs::write(fixture.0.join("index.html"), "<h1>Report</h1>").unwrap();
        let html = preview(fixture.0.to_str().unwrap(), "index.html").unwrap();
        assert_eq!(html.kind, "html");
        assert_eq!(html.text.as_deref(), Some("<h1>Report</h1>"));
    }

    #[test]
    fn refuses_oversized_previews_and_overwriting_copies() {
        let fixture = Fixture::new();
        let oversized = std::fs::File::create(fixture.0.join("large.pdf")).unwrap();
        oversized.set_len(20 * 1024 * 1024 + 1).unwrap();
        assert!(preview(fixture.0.to_str().unwrap(), "large.pdf")
            .unwrap_err()
            .contains("20 MB"));

        std::fs::write(fixture.0.join("note.txt"), "hello").unwrap();
        let destination = fixture.0.join("copy.txt");
        let cwd = fixture.0.to_string_lossy().into_owned();
        let target = destination.to_string_lossy().into_owned();
        copy_workspace_file(cwd.clone(), "note.txt".into(), target.clone()).unwrap();
        assert_eq!(std::fs::read_to_string(&destination).unwrap(), "hello");
        assert!(copy_workspace_file(cwd, "note.txt".into(), target).is_err());
    }
}
