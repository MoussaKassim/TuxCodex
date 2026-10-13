use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const MAX_DIFF_BYTES: usize = 1_500_000;
const MAX_UNTRACKED_FILE_BYTES: u64 = 128_000;
static NEXT_WORKTREE: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    path: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    root: String,
    branch: String,
    is_worktree: bool,
    files: Vec<GitFile>,
    diff: String,
    truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWorktree {
    path: String,
    source_root: String,
}

async fn git_output(cwd: &Path, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(cwd).args(args).kill_on_drop(true);
    timeout(Duration::from_secs(30), command.output())
        .await
        .map_err(|_| "Git took too long while reading this repository.".to_string())?
        .map_err(|error| format!("Could not run Git: {error}"))
}

async fn git_diff_bounded(
    cwd: &Path,
    args: &[&str],
    extra_path: Option<&Path>,
    max_bytes: usize,
    allow_difference_exit: bool,
) -> Result<(String, bool), String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(cwd).args(args);
    if let Some(path) = extra_path {
        command.arg(path);
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Could not run Git: {error}"))?;
    let stdout = child.stdout.take().ok_or("Git output was unavailable.")?;
    let operation = async {
        let mut bytes = Vec::new();
        stdout
            .take(max_bytes.saturating_add(1) as u64)
            .read_to_end(&mut bytes)
            .await
            .map_err(|error| format!("Could not read Git diff: {error}"))?;
        let truncated = bytes.len() > max_bytes;
        if truncated {
            let _ = child.kill().await;
        }
        let status = child
            .wait()
            .await
            .map_err(|error| format!("Could not finish Git diff: {error}"))?;
        let valid_exit = status.success() || (allow_difference_exit && status.code() == Some(1));
        if !truncated && !valid_exit {
            return Err("Git could not read the diff for this repository.".into());
        }
        bytes.truncate(max_bytes);
        Ok((String::from_utf8_lossy(&bytes).into_owned(), truncated))
    };
    timeout(Duration::from_secs(30), operation)
        .await
        .map_err(|_| "Git took too long while reading this repository.".to_string())?
}

fn git_error(output: &Output) -> String {
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if detail.is_empty() {
        "Git could not complete the request.".into()
    } else {
        detail
    }
}

async fn git_text(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_output(cwd, args).await?;
    if !output.status.success() {
        return Err(git_error(&output));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .trim_end_matches(['\r', '\n'])
        .to_string())
}

async fn repository_root(cwd: &Path) -> Result<PathBuf, String> {
    let path = cwd
        .canonicalize()
        .map_err(|error| format!("Workspace folder is unavailable: {error}"))?;
    if !path.is_dir() {
        return Err("Choose a workspace folder inside a Git repository.".into());
    }
    let root = git_text(&path, &["rev-parse", "--show-toplevel"])
        .await
        .map_err(|_| "Choose a workspace folder inside a Git repository.".to_string())?;
    PathBuf::from(root)
        .canonicalize()
        .map_err(|error| format!("Could not resolve repository root: {error}"))
}

fn parse_status(bytes: &[u8]) -> Vec<GitFile> {
    let mut files = Vec::new();
    let mut records = bytes
        .split(|byte| *byte == b'\0')
        .filter(|part| !part.is_empty());
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let status = String::from_utf8_lossy(&record[..2]).to_string();
        let path = String::from_utf8_lossy(&record[3..]).to_string();
        if status.contains('R') || status.contains('C') {
            let _ = records.next();
        }
        files.push(GitFile { path, status });
    }
    files
}

fn append_diff(diff: &mut String, chunk: &str) -> bool {
    if diff.len() >= MAX_DIFF_BYTES {
        return true;
    }
    let remaining = MAX_DIFF_BYTES - diff.len();
    if chunk.len() <= remaining {
        diff.push_str(chunk);
        return false;
    }
    let mut boundary = remaining;
    while !chunk.is_char_boundary(boundary) {
        boundary -= 1;
    }
    diff.push_str(&chunk[..boundary]);
    true
}

fn resolve_git_dir(root: &Path, value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let path = if path.is_absolute() {
        path
    } else {
        root.join(path)
    };
    path.canonicalize()
        .map_err(|error| format!("Could not resolve Git directory: {error}"))
}

async fn snapshot_for(cwd: &Path) -> Result<GitSnapshot, String> {
    let root = repository_root(cwd).await?;
    let branch = git_text(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .unwrap_or_else(|_| "Detached HEAD".into());
    let git_dir = resolve_git_dir(&root, &git_text(&root, &["rev-parse", "--git-dir"]).await?)?;
    let common_dir = resolve_git_dir(
        &root,
        &git_text(&root, &["rev-parse", "--git-common-dir"]).await?,
    )?;
    let status = git_output(
        &root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    .await?;
    if !status.status.success() {
        return Err(git_error(&status));
    }
    let files = parse_status(&status.stdout);
    let has_head = git_output(&root, &["rev-parse", "--verify", "HEAD"])
        .await?
        .status
        .success();
    let diff_args = if has_head {
        vec!["diff", "--no-ext-diff", "--no-color", "HEAD", "--"]
    } else {
        vec!["diff", "--no-ext-diff", "--no-color", "--cached", "--"]
    };
    let (tracked, tracked_truncated) =
        git_diff_bounded(&root, &diff_args, None, MAX_DIFF_BYTES, false).await?;
    let mut diff = String::new();
    let mut truncated = append_diff(&mut diff, &tracked) || tracked_truncated;
    if !has_head && !truncated {
        let (unstaged, unstaged_truncated) = git_diff_bounded(
            &root,
            &["diff", "--no-ext-diff", "--no-color", "--"],
            None,
            MAX_DIFF_BYTES - diff.len(),
            false,
        )
        .await?;
        truncated = append_diff(&mut diff, &unstaged) || unstaged_truncated;
    }
    for file in files.iter().filter(|file| file.status == "??") {
        if truncated {
            break;
        }
        let path = root.join(&file.path);
        let metadata = match path.symlink_metadata() {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_UNTRACKED_FILE_BYTES => {
                metadata
            }
            _ => continue,
        };
        if metadata.len() == 0 {
            continue;
        }
        let (change, change_truncated) = git_diff_bounded(
            &root,
            &[
                "diff",
                "--no-index",
                "--no-ext-diff",
                "--no-color",
                "--",
                "/dev/null",
            ],
            Some(&path),
            MAX_DIFF_BYTES - diff.len(),
            true,
        )
        .await?;
        truncated = append_diff(&mut diff, &change) || change_truncated;
    }
    if truncated {
        diff.push_str("\n\n[Diff truncated at 1.5 MB. Open the repository for the full change.]\n");
    }
    Ok(GitSnapshot {
        root: root.to_string_lossy().to_string(),
        branch,
        is_worktree: git_dir != common_dir,
        files,
        diff,
        truncated,
    })
}

async fn create_worktree_for(cwd: &Path, base: &Path) -> Result<CreatedWorktree, String> {
    let root = repository_root(cwd).await?;
    git_text(&root, &["rev-parse", "--verify", "HEAD"])
        .await
        .map_err(|_| "Commit this repository once before creating a worktree.".to_string())?;
    std::fs::create_dir_all(base)
        .map_err(|error| format!("Could not create worktree directory: {error}"))?;
    let label = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project")
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let path = base.join(format!(
        "{label}-{stamp:x}-{}-{}",
        std::process::id(),
        NEXT_WORKTREE.fetch_add(1, Ordering::Relaxed)
    ));
    let output = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["worktree", "add", "--detach"])
        .arg(&path)
        .arg("HEAD")
        .output()
        .await
        .map_err(|error| format!("Could not create Git worktree: {error}"))?;
    if !output.status.success() {
        return Err(git_error(&output));
    }
    Ok(CreatedWorktree {
        path: path.to_string_lossy().to_string(),
        source_root: root.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn git_snapshot(cwd: String) -> Result<GitSnapshot, String> {
    snapshot_for(Path::new(&cwd)).await
}

#[tauri::command]
pub async fn create_worktree(app: AppHandle, cwd: String) -> Result<CreatedWorktree, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not locate app data: {error}"))?
        .join("worktrees");
    create_worktree_for(Path::new(&cwd), &base).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as StdCommand;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn run(cwd: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .arg("-C")
            .arg(cwd)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn fixture() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "tuxcodex-git-test-{stamp}-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).unwrap();
        run(&root, &["init", "-q"]);
        run(&root, &["config", "user.name", "TuxCodex Test"]);
        run(&root, &["config", "user.email", "test@example.invalid"]);
        std::fs::write(root.join("tracked.txt"), "before\n").unwrap();
        run(&root, &["add", "tracked.txt"]);
        run(&root, &["commit", "-qm", "initial"]);
        root
    }

    #[tokio::test]
    async fn snapshot_includes_tracked_and_untracked_changes() {
        let root = fixture();
        std::fs::write(root.join("tracked.txt"), "after\n").unwrap();
        std::fs::write(root.join("new.txt"), "new file\n").unwrap();
        std::fs::write(root.join("staged.txt"), "staged file\n").unwrap();
        run(&root, &["add", "staged.txt"]);
        let snapshot = snapshot_for(&root).await.unwrap();
        assert_eq!(snapshot.files.len(), 3);
        assert!(snapshot.diff.contains("+after"));
        assert!(snapshot.diff.contains("+new file"));
        assert!(snapshot.diff.contains("+staged file"));
        assert!(!snapshot.is_worktree);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn snapshot_bounds_large_tracked_diffs() {
        let root = fixture();
        std::fs::write(
            root.join("tracked.txt"),
            "x".repeat(MAX_DIFF_BYTES + 100_000),
        )
        .unwrap();
        let snapshot = snapshot_for(&root).await.unwrap();
        assert!(snapshot.truncated);
        assert!(snapshot.diff.len() < MAX_DIFF_BYTES + 200);
        assert!(snapshot.diff.contains("[Diff truncated"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn new_worktree_is_detached_and_keeps_local_checkout() {
        let root = fixture();
        let base = root.with_extension("worktrees");
        let created = create_worktree_for(&root, &base).await.unwrap();
        let worktree = PathBuf::from(&created.path);
        let snapshot = snapshot_for(&worktree).await.unwrap();
        assert!(snapshot.is_worktree);
        assert_eq!(snapshot.branch, "Detached HEAD");
        assert!(root.join("tracked.txt").exists());
        let path = worktree.to_string_lossy().to_string();
        run(&root, &["worktree", "remove", &path]);
        std::fs::remove_dir_all(base).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
}
