# Mole

[中文说明](./README.zh-CN.md)

```
┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴
```

**Session manager for profiles, hosts, and terminal workflows**

Mole is a Wails desktop app for running named runtime sessions with reusable environment profiles. It can start plain shell sessions, generate SSH commands from saved hosts, and reopen saved sessions in your preferred terminal.

Today the default runtime is still tmux, but tmux is now treated as a backend instead of the whole app model:

- macOS and Linux default to a local tmux backend
- Windows defaults to a `WSL + tmux` backend when available
- Terminal launching is selected per platform instead of being hard-coded to macOS only

## What It Does

- Create reusable profiles with environment variables and UI-only secret masking
- Save hosts and groups, then turn a host into a generated SSH launch command
- Create sessions in three modes: `Shell`, `SSH Host`, and `Command`
- Reattach to live sessions or restore dead sessions after backend/server loss
- Open sessions in your preferred terminal, with platform-aware terminal detection
- Import/export host inventory JSON and bulk import profile variables

## Platform Support

### Runtime backend

- macOS: local `tmux`
- Linux: local `tmux`
- Windows: `WSL + tmux`

### Terminal detection

- macOS: Terminal.app, iTerm2, Ghostty, Rio, Warp, Alacritty, Kitty
- Linux: Ghostty, Kitty, Alacritty, Rio, GNOME Terminal, Konsole, xterm
- Windows: PowerShell, Command Prompt

### Current status

- macOS remains the most mature path and the main day-to-day target.
- Linux now has platform-aware terminal detection and launch plumbing, but still needs broader real-machine validation.
- Windows currently assumes WSL is installed and that `tmux` is available inside WSL. This path is implemented, but it has not been validated as heavily as macOS.

## Honest Storage Model

Mole stores its app data as JSON files under `~/.config/mole/`:

- `profiles.json`
- `sessions.json`
- `hosts.json`
- `settings.json`

`secret_keys` only tells the UI which values should be masked. The values themselves still live in `profiles.json`, so avoid using real production credentials in local dev data.

## Stack

- Backend: Go + Wails v2
- Frontend: React 19 + TypeScript + Vite
- UI: Tailwind CSS v4 + Radix primitives
- Runtime backend: local `tmux` on macOS/Linux, `WSL + tmux` on Windows

## Development

### Quick Start

```bash
./scripts/run.sh
./scripts/build.sh
```

These wrapper scripts are still primarily tuned for the macOS workflow. On Linux or Windows, prefer the manual commands below until the scripts are generalized.

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

Examples:

```bash
# macOS
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# WSL (inside the Linux shell)
sudo apt install tmux
```

## Usage Flow

1. Create a profile in `Profiles`.
2. Optionally save hosts and groups in `Hosts`.
3. Create a session in `Sessions` with `Shell`, `SSH Host`, or `Command`.
4. Use `Attach` for live sessions or `Restore & Attach` for saved-but-dead sessions.

Mole stores session metadata separately from the live runtime backend. That means a saved session can still appear in the UI even if the backend process is currently gone, and `Restore & Attach` can recreate it from stored settings.

## Supported Variable Import Formats

```bash
KEY=value
export DATABASE_URL=postgresql://localhost/app
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Repository Notes

- Historical planning material lives in `docs/archive/mole-design-legacy.md`.
- Wails bindings under `frontend/wailsjs/` are generated files.
- Runtime session metadata still keeps `tmux_session_name` for compatibility, even though session actions are now routed internally by `session id`.

## License

MIT
