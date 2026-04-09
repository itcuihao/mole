# Mole

```
┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴
```

**macOS tmux session manager for profiles, hosts, and terminal workflows**

Mole is a Wails desktop app for running named tmux sessions with reusable environment profiles. It can start plain shell sessions, generate SSH commands from saved hosts, and reopen saved sessions in your preferred terminal.

## What It Does

- Create reusable profiles with environment variables and UI-only secret masking
- Save hosts and groups, then turn a host into a generated SSH launch command
- Create tmux sessions in three modes: `Shell`, `SSH Host`, and `Command`
- Reattach to live sessions or restore dead sessions after tmux/server loss
- Open sessions in Terminal.app, iTerm2, Ghostty, Rio, Warp, Alacritty, or Kitty
- Import/export host inventory JSON and bulk import profile variables

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
- Runtime dependency: `tmux`

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

## Usage Flow

1. Create a profile in `Profiles`.
2. Optionally save hosts and groups in `Hosts`.
3. Create a session in `Sessions` with `Shell`, `SSH Host`, or `Command`.
4. Use `Attach` for live sessions or `Restore & Attach` for saved-but-dead sessions.

## Supported Variable Import Formats

```bash
KEY=value
export DATABASE_URL=postgresql://localhost/app
{"API_BASE_URL": "https://example.com", "TOKEN": "dev-token"}
```

## Repository Notes

- Historical planning material lives in `docs/archive/mole-design-legacy.md`.
- Wails bindings under `frontend/wailsjs/` are generated files.

## License

MIT
