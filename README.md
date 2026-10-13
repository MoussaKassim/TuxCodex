# TuxCodex

An unofficial desktop client for OpenAI Codex on Linux. TuxCodex uses a Tauri 2 interface and talks to the official `codex app-server` process through newline-delimited JSON-RPC over standard input and output.

The repository also contains Moussa's earlier Python/GTK 3 prototype as [`codex-desktop-linux.tar`](codex-desktop-linux.tar). The Tauri app is the active implementation; the archive remains available as a reference for the original feature set and tests. Its [original README is translated into English](docs/gtk-prototype-readme.en.md).

## Features

- **Codex server lifecycle:** starts the installed Codex CLI in the background, reports connection status, and lets you restart it from Settings. The app searches common user installation paths and accepts an explicit CLI path.
- **Projects and chats:** groups local Codex threads by workspace, keeps recently selected workspaces in the sidebar for quick switching, searches thread titles and paths, reads existing history, and offers archive or confirmed permanent deletion. Choose a workspace with the native folder picker or enter its path.
- **Live work and review:** streams rendered Markdown replies, shows command output on demand, and displays chat file diffs, live plan steps, and Git working-tree changes in a review panel. You can ask the official Codex reviewer to review uncommitted changes. Enter sends a message, Shift+Enter adds a line, and the stop button interrupts an active turn.
- **Git worktrees:** creates a separate detached checkout from the selected repository's current `HEAD` for a new chat. Worktrees are stored in TuxCodex's app-local data directory and remain available until you remove them with Git. Local uncommitted and ignored files are not copied.
- **Approvals:** displays command and file-change approval requests. You can allow one request or decline it. Unanswered requests are declined after five minutes. Other server-initiated requests are rejected until the client supports them explicitly.
- **Model and effort:** loads available models and their supported reasoning efforts from `model/list`; choose them in the composer or use the CLI defaults.
- **Image input:** attach up to five local PNG, JPEG, or WebP images with a message. The selected paths are sent to the local app-server as `localImage` inputs; TuxCodex stores no image copies.
- **Appearance and preview:** dark, light, and system themes. If the CLI cannot start, the desktop app opens a clearly marked offline preview with sample chats and a Retry action. The browser preview also uses sample data.

TuxCodex uses the local Codex authentication and configuration. Sign in with the CLI before opening the desktop app. It does not collect or store an API key in its own settings.

## Requirements

- Linux desktop with WebKitGTK 4.1. Ubuntu 24.04 LTS is the primary target; other current Debian, Fedora, and Arch systems should work with their corresponding Tauri packages.
- Node.js and npm for development, plus Rust and Cargo for building the desktop app.
- The official Codex CLI, installed and authenticated on the same machine.

On Ubuntu or Debian, install the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Install and sign in to Codex:

```bash
npm install -g @openai/codex
codex login
```

If your desktop launcher cannot find `codex`, set its full path in TuxCodex Settings or use `TUXCODEX_CODEX_BIN`. The CLI remains a separate prerequisite and is not bundled with TuxCodex.

## Worktrees and review

Choose a Git repository in Settings, start a new chat, then select **Create worktree from HEAD** below the composer to work in a separate checkout. The original checkout remains in the project sidebar. The worktree starts from the current commit; uncommitted and ignored files stay in the original checkout.

Open **Review > Git** to inspect the current workspace's staged, unstaged, and small untracked text changes. Select **Review changes with Codex** to run an inline Codex review in the active chat. **Review > Chat** shows file changes reported during the chat, while **Review > Plan** shows live plan updates.

## Run and build

```bash
git clone https://github.com/MoussaKassim/TuxCodex.git
cd TuxCodex
npm ci
npm run tauri dev
```

For an installable Linux package:

```bash
npm run tauri build -- --bundles deb
```

The build writes a `.deb` under `src-tauri/target/release/bundle/deb/`. Tauri can also build an AppImage with `npm run tauri build -- --bundles appimage`; that packaging route has not yet been validated here. Run `npm run dev` to view a browser-only interface preview with sample data. The browser preview cannot connect to Codex.

## How it works

```text
React + TypeScript interface (src/)
    │ Tauri commands and events
    ▼
Rust bridge (src-tauri/src/lib.rs)
    │ JSON lines over stdio
    ▼
codex app-server (installed Codex CLI)
```

The Rust bridge initializes one app-server process, correlates requests with responses, forwards streamed events, and handles approval replies. The frontend reads thread history from Codex using `thread/read`; it does not maintain a separate SQLite cache. The user's Codex configuration controls authentication, sandboxing, and default approval policy. The UI does not silently approve commands or file changes.

The app-server protocol changes with Codex versions. The [official App Server documentation](https://learn.chatgpt.com/docs/app-server) is the source for supported methods and event shapes. The model list is a picker catalog, not proof that a particular account can run every listed model.

## Roadmap toward Codex desktop parity

The most useful next additions are worktree handoff and cleanup, a branch selector when starting a worktree, an integrated terminal, general file attachments, and richer search across chat content. Later milestones can cover skills and plugins, scheduled tasks, and voice input. The Git review tab is read-only: it shows staged, unstaged, and small untracked text changes but does not yet stage, revert, or commit files. Large or binary untracked files appear in its file list without a text diff.

If a turn fails with a model-not-supported message, update the Codex CLI and restart TuxCodex. An older CLI can return a stale default model even when authentication succeeds. You can also choose another listed model in Settings, but only a successful turn confirms access.

## Tests and continuous integration

```bash
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

The Linux workflow in `.github/workflows/ci.yml` builds the frontend, tests the Rust bridge, and packages the desktop app. Running a real inference turn requires an authenticated Codex account; build and UI checks alone do not verify that service connection.

## Earlier GTK prototype

The attached archive contains a Python/GTK 3 implementation with a JSON-RPC client, process manager, SQLite cache, mock server, package script, and tests. It informed the initial Tauri feature list, but it has different runtime requirements and is not part of the Tauri build. The old root-level `setup.py` and `build_deb.sh` belong to that prototype and require extracted source files to run.

To inspect the source without executing it:

```bash
tar -tf codex-desktop-linux.tar
```

## License

MIT. See [LICENSE](LICENSE).
