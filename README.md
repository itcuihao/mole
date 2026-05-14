# Mole

[中文说明](./README.zh-CN.md)

```
┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴
```

**Terminal workspace manager for profiles, hosts, and commands**

Mole is a Wails desktop app for running named runtime sessions with reusable environment profiles. It launches sessions across nine run modes — plain shell, SSH, custom commands, Docker containers, Codex (OpenAI CLI), Kubernetes pods, Conda environments, SSH config hosts, and tmux attach — and opens them in your preferred terminal with optional window grouping.

## Features

- Create reusable profiles with environment variables and UI-only secret masking
- Save hosts and groups, then turn a host into a generated SSH launch command (with bastion/JumpHost support)
- Create sessions in nine run modes via a plugin architecture:
  - **Shell** — plain terminal session
  - **SSH Host** — connect to an inventory host
  - **Command** — run a custom command
  - **Codex** — launch OpenAI Codex CLI with an isolated home directory
  - **Docker** — launch a Docker container shell
  - **K8s Pod** — exec into a Kubernetes pod via kubectl
  - **Conda** — activate a Conda environment
  - **SSH Config** — connect to a host from ~/.ssh/config
  - **Tmux Attach** / **Remote Tmux** — attach to a local or remote tmux session
- Group sessions into **dens** (巢) that share a terminal window (iTerm2 tabs, Ghostty window-id)
- Reattach to live sessions or restore dead sessions after backend loss
- macOS system tray with quick session attach and new-session shortcut
- Full **Burrow** export/import: portable JSON bundle of profiles, hosts, groups, plugin presets, and sessions
- English and Chinese UI with language selector
- Profile change detection: auto-syncs env vars to live sessions when a profile is updated

## Platform Support

### Runtime backend

- macOS: local `tmux`
- Linux: local `tmux`
- Windows: `WSL + tmux`

### Terminal detection

| Terminal | macOS | Linux | Windows |
|----------|:-----:|:-----:|:-------:|
| Terminal.app | Yes | | |
| iTerm2 | Yes | | |
| Ghostty | Yes | Yes | |
| Warp | Yes | Yes | |
| Alacritty | Yes | Yes | |
| Kitty | Yes | Yes | |
| Rio | Yes | Yes | |
| WezTerm | | Yes | |
| GNOME Terminal | | Yes | |
| Konsole | | Yes | |
| xterm | | Yes | |
| Tilix | | Yes | |
| Terminator | | Yes | |
| Foot | | Yes | |
| PowerShell | | | Yes |
| CMD | | | Yes |

### Den grouping support

- **iTerm2**: AppleScript-based window/tab management — finds or creates a window named "Mole: <den>", adds tabs for same-den sessions, supports focus and close
- **Ghostty**: `--window-id=mole-<den>` for grouped windows
- Other terminals: sessions open in separate windows

### Clipboard fallback

For terminals that cannot accept a command programmatically (Warp, some generic terminals), Mole copies the command to the clipboard and opens the terminal bare.

### Current status

- macOS is the most mature path and the main day-to-day target.
- Linux has platform-aware terminal detection and launch plumbing, but needs broader real-machine validation.
- Windows assumes WSL is installed and `tmux` is available inside WSL. This path is implemented but not validated as heavily as macOS.

## Storage Model

Mole stores its app data as JSON files under `~/.config/mole/`:

| File | Content |
|------|---------|
| `profiles.json` | Profile definitions with env vars and secret key flags |
| `sessions.json` | Session definitions (run mode, plugin references, den, usage tracking) |
| `hosts.json` | Host inventory (hosts, groups, defaults) |
| `settings.json` | Settings (default terminal) |
| `codex_configs.json` | Codex configuration definitions |
| `docker_configs.json` | Docker configuration definitions |
| `plugin_configs.json` | Plugin preset definitions (for K8s Pod, Conda, SSH Config, Tmux Attach, Remote Tmux) |
| `ai/codex/<id>/` | Isolated Codex home directories (config.toml, auth.json) |

`secret_keys` only tells the UI which values should be masked. The values themselves still live in `profiles.json`, so avoid using real production credentials in local dev data.

## Stack

- Backend: Go + Wails v2
- Frontend: React 19 + TypeScript + Vite
- UI: Tailwind CSS v4 + Radix primitives
- Runtime backend: local `tmux` on macOS/Linux, `WSL + tmux` on Windows
- System tray: `fyne.io/systray` (macOS, requires CGO)

## Install

### Homebrew (macOS)

```bash
brew tap itcuihao/mole https://github.com/itcuihao/mole.git
brew install --cask itcuihao/mole/mole
```

`tmux` is required at runtime. If you do not already have it:

```bash
brew install tmux
```

## Development

### Quick Start

```bash
./scripts/run.sh
./scripts/build.sh
```

### Manual Commands

```bash
cd frontend && npm install
wails dev
wails build
```

### Verification

```bash
go test ./...
cd frontend && npx tsc --noEmit
```

### Runtime Prerequisites

- macOS: `tmux` must be installed and available in `PATH`
- Linux: `tmux` must be installed and available in `PATH`
- Windows: `wsl.exe` must be available, and `tmux` must be installed inside your default WSL distribution

```bash
# macOS
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# WSL (inside the Linux shell)
sudo apt install tmux
```

## Usage Flow

1. Create a profile in **Profiles**.
2. Optionally save hosts and groups in **Hosts**.
3. Create a workspace in **Burrows** — pick a run mode, configure it, optionally assign a den.
4. Use **Open** for live workspaces or **Restore** for saved-but-dead workspaces.

Mole stores workspace metadata separately from the live runtime backend. A saved workspace can still appear in the UI even if the backend process is gone, and **Restore** recreates it from stored settings.

## Supported Variable Import Formats

```bash
KEY=value
export DATABASE_URL=postgresql://localhost/app
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Release

Releases are built via GitHub Actions on `v*` tag push. The workflow produces macOS ZIP archives (arm64 + amd64) with SHA256 checksums and publishes a GitHub Release with auto-generated notes.

```bash
./scripts/release.sh --version v0.1.3
```

## Repository Notes

- Historical planning material lives in `docs/archive/mole-design-legacy.md`.
- Wails bindings under `frontend/wailsjs/` are generated files.
- Runtime session metadata keeps `tmux_session_name` for compatibility, even though session actions are now routed internally by session ID.

## License

MIT