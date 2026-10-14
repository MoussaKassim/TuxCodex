# Codex Desktop Linux (Unofficial) — original README in English

This is an English translation of the README that accompanied the earlier Python/GTK 3 prototype in `codex-desktop-linux.tar`. It is kept for historical reference. Its release links, build instructions, model examples, and verification claims describe that prototype, not the active Tauri app. See the [current README](../README.md) for TuxCodex instructions.

The prototype is a native Linux desktop application, optimized for Ubuntu 24.04 LTS and compatible distributions, that provides a graphical interface to Codex through the official `Codex app-server` protocol (JSON-RPC 2.0).

## Key features described by the prototype

1. **Background Codex server**
   - Automatically finds the `codex` binary in `PATH`, `~/.local/bin`, `~/.cargo/bin`, nvm, or `/usr/local/bin`.
   - Supervises the `codex app-server --listen stdio://` child process.
   - Shows live status in the title bar: Connected, Starting, Error, or Simulation Mode.
   - Includes a mock server so the app can be tried offline or without an OpenAI account.
2. **Conversation management**
   - Shows chats in a sidebar with model previews, dates, and instant search.
   - Creates new sessions with `thread/start`.
   - Resumes conversations with `thread/resume` and reloads message history from a local SQLite cache under `~/.local/share/codex-desktop/`.
   - Provides secure conversation deletion.
3. **Real-time messages and streaming**
   - Multi-line input: Enter sends and Shift+Enter inserts a line break.
   - Streams replies from `item/agentMessage/delta` JSON-RPC notifications.
   - Interrupts active generations with `turn/interrupt`.
   - Distinguishes user and assistant message bubbles and supports dark and light themes.
4. **Security and control**
   - Shows an interactive approval dialog when Codex asks to run a command or change files (`item/commandExecution/requestApproval`).
   - Offers a model selector. The historical examples were `gpt-5.1-codex`, `gpt-6.1-sol`, and `gpt-5-mini`; model availability changes over time.

## Historical system requirements

- Ubuntu 24.04 LTS (Noble Numbat) or a modern Linux distribution such as Debian 12+, Fedora, or Arch Linux.
- An X11 or Wayland desktop such as GNOME, KDE, or XFCE.
- Python 3 and GTK 3 packages:

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-gi gir1.2-gtk-3.0
```

The prototype supervises the official Codex CLI. Its original setup was:

```bash
npm install -g @openai/codex
codex login
```

The original README also suggested setting `OPENAI_API_KEY` as an alternative. When `codex` is absent, the prototype was intended to start automatically in simulation mode.

## Historical installation instructions

**Debian package:** Download `codex-desktop_1.0.0_all.deb` from the project's GitHub Releases or build it locally, then run:

```bash
sudo dpkg -i dist/codex-desktop_1.0.0_all.deb
sudo apt-get install -f -y  # only if dependencies are missing
codex-desktop
```

**Run from source:** The original README showed a placeholder clone URL (`VOTRE_UTILISATEUR/codex-desktop-linux`) and then ran `./bin/codex-desktop` from the extracted source. These commands apply only to the prototype source inside the archive. Its launcher options were:

- `--mock` to force the local simulation server.
- `--debug` to print JSON-RPC messages and detailed traces.
- `--codex-bin /path/to/codex` to select a specific binary.

## Prototype architecture

```text
GTK 3 interface
  ui.py: search, thread list, message bubbles, streaming
  storage.py: SQLite thread and message persistence
      ↓ method calls and callbacks
ProcessManager: supervises the child process and captures stderr
      ↓ JSONL over stdin/stdout
CodexClient: JSON-RPC 2.0
  initialize / initialized
  thread/start, thread/resume, thread/list
  turn/start, turn/interrupt
  item/agentMessage/delta notifications
  item/.../requestApproval server requests
      ↓ stdio pipe
codex app-server or the offline MockCodexAppServer
```

## Prototype tests and CI described in the original README

The archive describes tests for JSON-RPC framing, requests and responses, errors and approvals, SQLite persistence, background process lifecycle, and a mock end-to-end exchange with streaming deltas. Its test command was:

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

The original CI description claimed an Ubuntu 24.04 workflow that installed GTK 3 and Xvfb, ran all tests, built a `.deb` with `./build_deb.sh`, installed and checked the package, and published a GitHub Release plus `.tar.gz` on a `v1.0.0` tag. That described workflow is not the Tauri workflow in the current repository.

## Original publication procedure

The prototype documentation said to extract `codex-desktop-linux.tar.gz`, create a new GitHub repository, set its remote, push `main`, create `v1.0.0`, and push the tag. The current repository is already on GitHub, and this historical procedure should not be run for TuxCodex.

## Verification claims in the original README

| Component | Original claim |
| --- | --- |
| JSON-RPC 2.0 parsing and framing | Verified by dedicated unit tests |
| Background process lifecycle | Verified start, supervision, and clean shutdown |
| Streaming replies | Verified delta reception and concatenation |
| Chat persistence and resumption | Verified SQLite CRUD for threads and messages |
| Command approvals | Verified `accept` and `decline` replies to the server |
| Debian package | Verified `dpkg-deb`, XDG layout, and metadata |
| GitHub Actions workflow | Claimed YAML syntax validation for checkout and Python setup actions |
| GTK 3 interface | Claimed PyGObject import and GTK initialization |
| Direct OpenAI connection | Not verified in the original sandbox; a mock protocol server was used |
| GitHub publication | Not verified in the original sandbox |

These are translated historical claims, not new verification of the GTK app. TuxCodex uses a different codebase and has its own tests and Linux build.

## License

MIT; see [LICENSE](../LICENSE).
