# TuxCodex

An unofficial desktop client for OpenAI Codex on Linux. TuxCodex uses a Tauri 2 interface and talks to the official `codex app-server` process through newline-delimited JSON-RPC over standard input and output.

The repository also contains Moussa's earlier Python/GTK 3 prototype as [`codex-desktop-linux.tar`](codex-desktop-linux.tar). The Tauri app is the active implementation; the archive remains available as a reference for the original feature set and tests. Its [original README is translated into English](docs/gtk-prototype-readme.en.md).

## Features

- **Codex server lifecycle:** starts the installed Codex CLI in the background, reports connection status, and lets you restart it from Settings. The app searches common user installation paths and accepts an explicit CLI path.
- **Chats:** lists and searches local Codex threads, starts new threads, reads existing history, resumes conversations, and offers archive or confirmed permanent deletion.
- **Live work:** streams assistant replies and shows command and file activity. Enter sends a message, Shift+Enter adds a line, and the stop button interrupts an active turn.
- **Approvals:** displays command and file-change approval requests. You can allow one request or decline it. Unanswered requests are declined after five minutes. Other server-initiated requests are rejected until the client supports them explicitly.
- **Models and workspace:** loads the model picker from `model/list`, uses the CLI's default model unless you choose another, and lets you set a workspace path for new chats.
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
