use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_AUDIO: usize = 50 * 1024 * 1024;

fn audio_type(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        Some(("wav", "audio/wav"))
    } else if bytes.starts_with(b"ID3")
        || bytes.starts_with(&[0xff, 0xfb])
        || bytes.starts_with(&[0xff, 0xf3])
        || bytes.starts_with(&[0xff, 0xf2])
    {
        Some(("mp3", "audio/mpeg"))
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        Some(("m4a", "audio/mp4"))
    } else if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        Some(("webm", "audio/webm"))
    } else if bytes.starts_with(b"OggS") {
        Some(("ogg", "audio/ogg"))
    } else {
        None
    }
}

fn audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("audio"))
        .map_err(|e| e.to_string())
}

fn save_bytes(app: &AppHandle, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_AUDIO {
        return Err("Audio must be 50 MB or smaller.".into());
    }
    let (extension, _) =
        audio_type(bytes).ok_or("Unsupported audio file. Use WAV, MP3, M4A, WebM, or Ogg.")?;
    let dir = audio_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "clip-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        extension
    ));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn import_audio(app: AppHandle, source: String) -> Result<String, String> {
    let path = Path::new(&source);
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_AUDIO as u64 {
        return Err("Audio must be 50 MB or smaller.".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    save_bytes(&app, &bytes)
}

#[tauri::command]
pub fn save_recording(app: AppHandle, data_url: String) -> Result<String, String> {
    let (header, encoded) = data_url.split_once(',').ok_or("Invalid recording data.")?;
    if !header.starts_with("data:audio/") || !header.ends_with(";base64") {
        return Err("Invalid recording format.".into());
    }
    if encoded.len() > (MAX_AUDIO * 4 / 3) + 8 {
        return Err("Audio must be 50 MB or smaller.".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    save_bytes(&app, &bytes)
}

#[tauri::command]
pub fn read_audio(app: AppHandle, path: String) -> Result<String, String> {
    let root = std::fs::canonicalize(audio_dir(&app)?).map_err(|e| e.to_string())?;
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !path.starts_with(root) {
        return Err("Audio is outside the app's recording folder.".into());
    }
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_AUDIO as u64 {
        return Err("Audio must be 50 MB or smaller.".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let (_, mime) = audio_type(&bytes).ok_or("Unsupported audio file.")?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_audio_signatures() {
        assert_eq!(audio_type(b"OggSmore"), Some(("ogg", "audio/ogg")));
        assert_eq!(audio_type(b"not audio"), None);
        assert_eq!(audio_type(b"RIFFxxxxWAVEdata"), Some(("wav", "audio/wav")));
    }
}
