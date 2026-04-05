# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mole is a macOS desktop application that manages tmux sessions with profile-based environment configurations. Users create reusable profiles (collections of environment variables + secrets), then launch tmux sessions with those environments injected.

**Tech Stack**: Go + Wails v2 (backend) | React 19 + TypeScript + Vite (frontend) | Tailwind CSS v4 + shadcn/ui

**Key Dependencies**:
- tmux (user must have installed)
- macOS Keychain (for secret storage)

## Development Commands

```bash
# Install frontend dependencies
cd frontend && npm install

# Run in development mode (hot reload for both Go and frontend)
wails dev

# Build production binary
wails build

# Frontend only (for UI work)
cd frontend && npm run dev
```

## Architecture

### Data Flow
```
Frontend (React) → Wails Bridge → Go Backend → tmux CLI / Keychain
```

### Module Breakdown

**`app.go`** - Wails app entry, exposes Go methods to frontend via binding. All frontend API calls go through this file.

**`internal/profile/`**
- `Manager` - Orchestrates profile CRUD + Keychain operations
- `Store` - Reads/writes `~/.config/mole/profiles.json`
- `keychain.go` - macOS Keychain wrapper (service: "mole", account: "{profile_id}:{key_name}")
- Profile contains: plain env vars (stored in JSON) + secret keys list (values in Keychain)

**`internal/session/`**
- `Manager` - Session lifecycle + tmux integration
- `Store` - Reads/writes `~/.config/mole/sessions.json`
- `tmux.go` - Wraps tmux CLI (`tmux new-session -d -s mole-{name} -e K=V ...`)
- Auto-cleans stale sessions (metadata exists but tmux session dead)
- All tmux session names prefixed with `mole-`

**`internal/terminal/`**
- `launcher.go` - Opens terminal apps and attaches to tmux session
- `detector.go` - Scans `/Applications` for installed terminals
- Supports: Terminal.app, iTerm2, Ghostty, Rio, Warp, Alacritty, Kitty
- Uses AppleScript for Terminal.app/iTerm2, `open -a` for others

**`internal/config/`**
- Config directory: `~/.config/mole/`
- Files: `profiles.json`, `sessions.json`, `settings.json`

### Frontend Structure

- `src/pages/` - Main views: Profiles.tsx, Sessions.tsx, Settings.tsx
- `src/components/ui/` - shadcn/ui components
- `wailsjs/go/` - Auto-generated TypeScript bindings for Go methods

### Key Patterns

1. **Secret Handling**: Secret values NEVER stored in JSON. Profile contains `SecretKeys: []string`, actual values in Keychain. When creating session, `Manager.GetFullEnv()` merges plain vars + Keychain secrets.

2. **Session Naming**: User provides simple name like "work", tmux session becomes "mole-work". This prevents collisions with user's existing tmux sessions.

3. **Terminal Detection**: At runtime, scans common paths for terminal apps, returns list with isInstalled flag. User selects default in settings.

4. **State Sync**: `ListWithStatus()` queries live tmux state, compares with stored sessions, auto-deletes stale entries where tmux session no longer exists.

## Common Patterns

### Adding a new Go API method

1. Add method to `app.go` (must be exported, i.e., capitalized)
2. Wails auto-generates TypeScript bindings in `frontend/wailsjs/go/main/`
3. Import in React: `import { MethodName } from '../../wailsjs/go/main/App'`

### Working with Profiles

Profiles have two types of env vars:
- Plain: stored in `EnvVars map[string]string` in profiles.json
- Secret: keys listed in `SecretKeys []string`, values in Keychain

When saving: `profileMgr.Save(profile, secrets map[string]string)` where secrets contains key→value for secret keys.

### tmux Integration

- Create: `CreateTmuxSession(name, env, command)` - launches detached session with env injected
- List: `ListTmuxSessions()` - parses `tmux list-sessions` output
- Check: `IsTmuxSessionAlive(name)` - returns bool
- Kill: `KillTmuxSession(name)` - terminates session

All tmux commands executed via `exec.Command("tmux", ...)`.

## File Locations

- **Go code**: Root + `internal/`
- **Frontend**: `frontend/src/`
- **Wails config**: `wails.json`
- **User data**: `~/.config/mole/` (profiles.json, sessions.json, settings.json)
- **Secrets**: macOS Keychain (not filesystem)

## Testing

Currently no automated tests. Manual testing workflow:
1. Create profile with env vars
2. Mark some as secrets
3. Create session from profile
4. Verify tmux session created: `tmux ls`
5. Attach via UI
6. Check env vars in terminal: `echo $VAR_NAME`

## Design Constraints

- **macOS only** - Uses Keychain, AppleScript, macOS app detection
- **Requires tmux** - App won't work without it
- **Session lifecycle** - Machine reboot kills all tmux sessions, app auto-cleans stale metadata
- **Wails tray limitation** - Dynamic tray menu requires rebuilding entire menu on change
