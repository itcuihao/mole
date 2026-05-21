<p align="center">
  <img src="docs/appicon.png" alt="mole logo" width="128" height="128">
</p>

<h1 align="center">Mole</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  Terminal workspace manager for profiles, hosts, and commands
</p>

<p align="center">
  7 run modes · iTerm2/Ghostty window grouping · Reusable environment profiles · SSH host inventory
</p>

<p align="center">
  <img src="docs/hero.png" alt="Mole screenshot" width="720">
</p>

## Features

- **Burrows** — Launch terminal sessions across 7 run modes (Shell / SSH / Command / Codex / Docker / K8s / Tmux) → [Setup Guide](docs/guides/burrows.md)
- **Dens** — Group Burrows into the same terminal window (iTerm2 tabs / Ghostty windows) → [Setup Guide](docs/guides/dens.md)
- **Profiles** — Reusable environment configs + Provider presets (Claude / DeepSeek / GLM / Maxx) → [Setup Guide](docs/guides/profiles.md)
- **Hosts** — SSH host inventory, groups, bastion/JumpHost → [Setup Guide](docs/guides/hosts.md)

Also: System Tray, Burrow Export/Import, Profile change auto-sync, bilingual UI, theme toggle

## Platform Support

### Runtime backend

| Platform | Backends |
|----------|----------|
| macOS | `tmux` (local) |
| Linux | `tmux` (local) |
| Windows | `WSL + tmux` (default) · `PowerShell` (native, no WSL/tmux required) |

On Windows, each Burrow can choose its runtime backend:

- **WSL + tmux** — runs sessions inside WSL via tmux. Requires `wsl.exe`, a WSL distro, and `tmux` installed in the distro.
- **PowerShell (native)** — runs sessions directly in PowerShell without WSL or tmux. Sessions are in-memory and open in a standalone console window.

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
| PowerShell 7 (pwsh) | | | Yes |
| PowerShell (Windows PowerShell) | | | Yes |
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
- Windows supports two runtime backends: **WSL + tmux** (default, requires WSL + tmux setup) and **PowerShell** (native, works out of the box with no extra dependencies). Both paths are implemented but not validated as heavily as macOS.

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
| `plugin_configs.json` | Plugin preset definitions (for K8s Pod, Tmux Attach, Remote Tmux) |
| `script_configs.json` | Script preset definitions (built-in VS Code + Claude scripts, user scripts) |
| `ai/codex/<id>/` | Isolated Codex home directories (config.toml, auth.json) |

`secret_keys` only tells the UI which values should be masked. The values themselves still live in `profiles.json`, so avoid using real production credentials in local dev data.

## Stack

- Backend: Go + Wails v2
- Frontend: React 19 + TypeScript + Vite
- UI: Tailwind CSS v4 + Radix primitives
- Runtime backend: local `tmux` on macOS/Linux, `WSL + tmux` or `PowerShell` on Windows
- System tray: `fyne.io/systray` (macOS, requires CGO)

## Install

### Homebrew (macOS)

```bash
brew tap itcuihao/mole https://github.com/itcuihao/mole.git
brew install --cask itcuihao/mole/mole
```

To upgrade after installation:

```bash
brew update
brew upgrade --cask itcuihao/mole/mole
```

> Mole is served via a custom tap, not the official Homebrew cask repo — `brew upgrade --cask mole` (without the tap prefix) will not work.

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
- Windows (WSL + tmux backend):
  - `wsl.exe` must be available
  - at least one WSL distro must be initialized
  - `tmux` must be installed inside your default WSL distribution
- Windows (PowerShell backend):
  - No extra dependencies — works with the built-in PowerShell or PowerShell 7

```bash
# macOS
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# WSL (inside the Linux shell)
sudo apt install tmux
```

If no distro is initialized yet:

```bash
wsl --install -d Ubuntu
```

## Usage Flow

1. Create a profile in **Profiles**.
2. Optionally save hosts and groups in **Hosts**.
3. Create a Burrow in **Burrows** — pick a run mode, configure it, optionally assign a Den.
4. Use **Open** for live Burrows or **Restore** for saved-but-dead Burrows.

Mole stores Burrow metadata separately from the live runtime backend. A saved Burrow can still appear in the UI even if the backend process is gone, and **Restore** recreates it from stored settings.

## One-click VS Code + Claude (macOS / Windows / WSL)

Built-in script presets are available in **Settings > Scripts** (auto-provisioned on first run). You can also use the standalone scripts in this repo:

- `scripts/vscode-claude/start_vscode_claude_mac.sh` — macOS
- `scripts/vscode-claude/start_vscode_claude_win.ps1` — Windows (PowerShell backend)
- `scripts/vscode-claude/start_vscode_claude_wsl.sh` — Windows (WSL + tmux backend)

### 1) Configure profile environment variables

The scripts receive configuration from Mole automatically:

- **Workspace**: comes from the Burrow's `workspace` field (`MOLE_WORKSPACE` env var)
- **Environment variables**: come from the Profile's env vars (e.g., `ANTHROPIC_API_KEY`)

Add these to your Mole profile (Settings > Profiles):

- `ANTHROPIC_API_KEY` (required)
- `ANTHROPIC_BASE_URL` (optional)

What the scripts do:

- use `MOLE_WORKSPACE` as the project directory (falls back to `$HOME`)
- ensure `.claude/` exists in the project
- open VS Code in that project

### 2) Use it in Mole Burrow command

Create a local Burrow and set command to:

- macOS:
  `bash /absolute/path/to/mole/scripts/vscode-claude/start_vscode_claude_mac.sh`
- Windows:
  `powershell -ExecutionPolicy Bypass -File \"D:\\absolute\\path\\to\\mole\\scripts\\vscode-claude\\start_vscode_claude_win.ps1\"`

Then the user can just click Open/Restart.

## Supported Variable Import Formats

```bash
KEY=value
export DATABASE_URL=postgresql://localhost/app
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Release

Releases are built via GitHub Actions on `v*` tag push. The workflow produces macOS ZIP archives (arm64 + amd64) and a Windows ZIP archive (amd64), along with SHA256 checksums, then publishes a GitHub Release with auto-generated notes.

```bash
./scripts/release.sh --version v0.1.3
```

## Repository Notes

- Historical planning material lives in `docs/archive/mole-design-legacy.md`.
- Wails bindings under `frontend/wailsjs/` are generated files.
- Runtime session metadata keeps `tmux_session_name` for compatibility, even though session actions are now routed internally by session ID.

## License

MIT
