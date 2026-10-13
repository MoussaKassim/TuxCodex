use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_WALLPAPER_BYTES: u64 = 6 * 1024 * 1024;

fn format_for(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else {
        None
    }
}

fn data_url(bytes: &[u8]) -> Result<(&'static str, String), String> {
    if bytes.len() as u64 > MAX_WALLPAPER_BYTES {
        return Err("Wallpaper must be 6 MB or smaller.".into());
    }
    let (extension, mime) = format_for(bytes).ok_or("Choose a PNG, JPEG, or WebP image.")?;
    Ok((
        extension,
        format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
    ))
}

fn wallpaper_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("wallpapers"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_wallpaper(app: AppHandle, source: String) -> Result<(String, String), String> {
    if std::fs::metadata(&source)
        .map_err(|e| format!("Cannot read image: {e}"))?
        .len()
        > MAX_WALLPAPER_BYTES
    {
        return Err("Wallpaper must be 6 MB or smaller.".into());
    }
    let bytes = std::fs::read(&source).map_err(|e| format!("Cannot read image: {e}"))?;
    let (extension, url) = data_url(&bytes)?;
    let dir = wallpaper_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "custom-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        extension
    ));
    std::fs::write(&path, bytes).map_err(|e| format!("Cannot save wallpaper: {e}"))?;
    Ok((path.to_string_lossy().into_owned(), url))
}

#[tauri::command]
pub fn read_wallpaper(app: AppHandle, path: String) -> Result<String, String> {
    let allowed = std::fs::canonicalize(wallpaper_dir(&app)?).map_err(|e| e.to_string())?;
    let path = std::fs::canonicalize(Path::new(&path)).map_err(|e| e.to_string())?;
    if !path.starts_with(allowed) {
        return Err("Wallpaper is outside the app's wallpaper folder.".into());
    }
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_WALLPAPER_BYTES {
        return Err("Wallpaper must be 6 MB or smaller.".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    data_url(&bytes).map(|(_, url)| url)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_known_images_with_size_limit() {
        assert!(data_url(b"<svg onload='alert(1)'>").is_err());
        assert!(data_url(b"\x89PNG\r\n\x1a\nrest").is_ok());
        assert!(data_url(&vec![0; 6 * 1024 * 1024 + 1]).is_err());
    }
}
