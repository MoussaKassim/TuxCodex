# TuxCodex

![TuxCodex logo: a white TX monogram on deep blue](docs/images/tuxcodex-brand.png)

**An optional, community-built desktop interface for the Codex CLI.**

TuxCodex connects to the Codex CLI installed on your computer and presents its chats alongside project switching, Git review, and local file previews. It is an independent Tauri, React, and Rust project. Codex supplies the models, reasoning settings, tool execution, approvals, and AI responses; TuxCodex supplies this interface. The Ubuntu desktop experience has been tested; Windows and macOS installers remain previews.

## Why use TuxCodex?

OpenAI offers both the [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) and an [official Linux desktop app in preview](https://learn.chatgpt.com/docs/linux/linux-app). If either already fits your workflow, you do not need TuxCodex.

TuxCodex is an option for people who prefer this open-source, community-maintained interface, want to modify its Tauri/Rust code, or want its particular project, Git review, and file-preview workflow. We also publish an Ubuntu 22.04 package. TuxCodex does not add a new model or claim feature parity with OpenAI's app.

![TuxCodex workspace showing the project sidebar, new chat, model picker, and worktree action](docs/images/tuxcodex-workspace.png)

## Download

Get the latest preview installers from [GitHub Releases](https://github.com/MoussaKassim/TuxCodex/releases).

| Platform | Download |
| --- | --- |
| Ubuntu 22.04 / 24.04 (x86-64) | Separate `.deb` packages |
| Fedora (x86-64) | `.rpm` |
| Windows (x64) | `-setup.exe` |
| macOS (Apple silicon / Intel) | `.dmg` |

The installers are not code signed or notarized yet, so Windows or macOS may display a warning. Each release includes `SHA256SUMS.txt` for checking downloads.

## Get started

1. Install the [official Codex CLI](https://github.com/openai/codex) and sign in:

   ```bash
   npm install -g @openai/codex
   codex login
   ```

2. Download and install the TuxCodex package for your operating system from [Releases](https://github.com/MoussaKassim/TuxCodex/releases).
3. Open TuxCodex, choose a project folder, and start a chat.

TuxCodex uses your existing Codex sign-in and configuration. The CLI is a separate prerequisite and is not bundled with the app. If TuxCodex cannot find it, set the full path to `codex` in Settings or through `TUXCODEX_CODEX_BIN`.

## What you can do

These are workflows available through this client. Model selection, attachments, and permission enforcement depend on the installed Codex CLI; they are not exclusive TuxCodex capabilities.

- **Work across projects and chats:** choose a folder, create or resume chats, search titles and paths, and archive conversations.
- **Follow Codex as it works:** see streamed replies, command output, file changes, and plan updates; interrupt a turn when needed.
- **Review changes:** inspect Git changes in the review panel and ask Codex to review uncommitted work.
- **Use separate worktrees:** start a chat in a new Git worktree based on the current `HEAD`. Uncommitted and ignored files stay in the original checkout.
- **Control approvals:** accept or decline requests to run commands or change files. Switch permission modes beside the composer; Full Access requires explicit confirmation and returns to Standard when the app restarts.
- **Choose a model and reasoning effort:** use the options reported by your installed Codex CLI.
- **Attach and preview files:** send supported images or audio, record voice input, and preview workspace files including images, PDFs, HTML, and text. Generated images and image paths in replies appear inline and open in the larger viewer.
- **Make it yours:** switch themes and customize the wallpaper.

Feature availability can depend on the installed Codex CLI, selected model, and operating system.
Audio input requires a compatible Codex app-server: CLI 0.143.0 rejects `localAudio`, while 0.162.1 accepts the input shape. If the server rejects an audio turn, TuxCodex restores the draft and attachments. Actual audio processing still needs an authenticated desktop test.

## Data and privacy

TuxCodex does not run its own AI service or make model requests private. It starts the installed `codex app-server` locally and communicates with it over standard input/output. With a normal OpenAI Codex sign-in, Codex sends inference requests to OpenAI. TuxCodex uses the CLI's existing authentication and configuration. Avoid including credentials or other secrets in prompts or attachments. Standard and Full Access are Codex permission modes exposed through this interface; Full Access can allow commands and file changes without repeated prompts.

## Build from source

Install Node.js, npm, Rust, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system. On Ubuntu or Debian:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Then run:

```bash
git clone https://github.com/MoussaKassim/TuxCodex.git
cd TuxCodex
npm ci
npm run tauri dev
```

Use `npm run tauri build -- --bundles deb` on Ubuntu/Debian, or replace `deb` with `rpm`, `nsis`, or `dmg` on the matching platform. `npm run dev` opens a browser preview with sample data; the desktop app is needed to connect to Codex.

## How it works

```text
React + TypeScript interface
          │ Tauri commands and events
          ▼
      Rust bridge
          │ JSON lines over standard input/output
          ▼
 codex app-server (local Codex CLI)
```

TuxCodex starts `codex app-server` in the background and displays its responses and approval requests. Codex manages authentication and chat history. The [official App Server documentation](https://learn.chatgpt.com/docs/app-server) describes the protocol.
App-server versions differ in how they spell permission values. TuxCodex retries with the older enum spelling only when the server rejects the newer one.

Automated tests check TuxCodex's UI, Rust bridge, and packaged app workflows. They do not add testing abilities to Codex or replace tests for a user's own project.

## Development

```bash
npm test
npm run test:coverage
npm run test:app-server
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

`test:app-server` needs an installed `codex` CLI on `PATH`; use `TUXCODEX_TEST_CODEX_BIN` to select another executable. The test uses a temporary Codex home and workspace without starting an inference turn.

GitHub Actions runs frontend and Rust tests, checks the app-server protocol against an older and a current CLI, uploads JUnit reports and Ubuntu coverage, and builds installers for Ubuntu 22.04, Ubuntu 24.04, Fedora, Windows, and macOS. Each Linux job checks that the packaged app opens a visible window under Xvfb, reports startup time and launcher memory, selects a model and reasoning effort, sends a Standard-permission chat, declines a command approval request, confirms Full Access, and sends a second turn through the real composer and Rust bridge. A separate packaged-window run has the mock app-server create an SVG in a temporary workspace and checks that it appears inline and opens in the built-in viewer. Version tags publish installers only after the required jobs pass. Interactive testing on each platform is still valuable. Contributions and bug reports are welcome through [Issues](https://github.com/MoussaKassim/TuxCodex/issues).

## Authors

TuxCodex is developed by **Moussa Kassim Mohame** and **Stefano Cacciatore**. The [Git history](https://github.com/MoussaKassim/TuxCodex/commits/main/) records contributions to the project.

TuxCodex is an unofficial client and is not affiliated with OpenAI.

## License

[MIT](LICENSE).
