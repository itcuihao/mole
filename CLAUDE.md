# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

Mole is a macOS Wails app for managing tmux sessions with reusable profiles and saved SSH hosts.

Current stack:
- Go + Wails v2
- React 19 + TypeScript + Vite
- Tailwind CSS v4 + Radix primitives
- tmux as the runtime session engine

## Core Facts

- Profiles, sessions, hosts, and settings are stored as JSON files under `~/.config/mole/`.
- `secret_keys` is a UI hint only. Secret values are still stored in `profiles.json`.
- Sessions are persisted even if tmux is no longer running.
- Dead sessions can be restored from saved metadata.
- Host-based sessions store `run_mode=host` plus `host_id`, then rebuild the SSH command on restore/update.

## Main Modules

### `app.go`

Wails entrypoint. Frontend calls Go through exported methods here.

### `internal/profile/`

- `Store` reads/writes `profiles.json`
- `Manager` normalizes env vars and secret flags
- No Keychain integration exists in the current implementation

### `internal/inventory/`

- Stores hosts, groups, and default SSH values in `hosts.json`
- Can rebuild an SSH command from a saved host record

### `internal/session/`

- Stores session metadata in `sessions.json`
- Creates, kills, updates, and restores tmux sessions
- Supports `shell`, `host`, and `custom` run modes
- All tmux session names are prefixed with `mole-`

### `internal/terminal/`

- Detects installed terminal apps
- Launches attach commands in Terminal.app, iTerm2, Ghostty, Rio, Warp, Alacritty, or Kitty
- Terminal.app and iTerm2 launch through AppleScript

### `frontend/src/pages/`

- `Profiles.tsx`
- `Hosts.tsx`
- `Sessions.tsx`
- `Settings.tsx`

Shared modal styling lives in `frontend/src/components/ui/modal-shell.tsx`.

## Commands

```bash
./scripts/run.sh
./scripts/build.sh
go test ./...
cd frontend && npx tsc --noEmit
cd frontend && npm run dev
```

## Wails Binding Workflow

When adding a Go API method:

1. Add an exported method in `app.go`.
2. Regenerate or refresh Wails bindings.
3. Import from `frontend/wailsjs/go/main/App`.

Do not hand-edit generated binding files unless you are intentionally syncing a generated change already produced by Wails.

## Current Behavior To Preserve

- Session cards should prefer a single primary action: attach when alive, restore-and-attach when dead.
- `Attach` should remain the first session action.
- New/Edit session flows should stay short and mode-driven.
- Modal overlays should be opaque and visually separate from the background.
- Long modal content must scroll inside the modal body.

## Verification

Useful manual checks:

1. Create a profile with normal and masked variables.
2. Add a host and optionally a host group.
3. Create sessions in all three run modes.
4. Run `tmux ls` to confirm session creation.
5. Attach from the UI and verify env vars with `echo $VAR_NAME`.
6. Kill tmux externally, then verify `Restore & Attach` works.

## Historical Docs

- `docs/archive/mole-design-legacy.md` is an old planning document and does not describe the current implementation faithfully.
