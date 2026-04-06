# Repository Guidelines

## Project Structure & Module Organization
- `app.go` and `main.go` host the Wails app entry and startup wiring.
- Backend modules live under `internal/` (profile CRUD, tmux session lifecycle, terminal launching, and config storage).
- `frontend/` is the React + Vite UI. Key paths: `frontend/src/pages/`, `frontend/src/components/ui/`, `frontend/wailsjs/` (auto-generated bindings; do not edit).
- `scripts/` has `run.sh` and `build.sh` wrappers.
- `build/` contains build artifacts.
- `wails.json` is the Wails config.

## Build, Test, and Development Commands
- `./scripts/run.sh` runs dev mode and checks `tmux`, `wails`, and frontend deps.
- `./scripts/build.sh` builds the production app bundle.
- `cd frontend && npm install` installs UI dependencies.
- `wails dev` runs hot-reload dev for Go + frontend.
- `wails build` builds the app without the wrapper script.
- `cd frontend && npm run dev` runs the UI only (useful for layout work).

## Coding Style & Naming Conventions
- Go code should be `gofmt`-formatted; keep packages under `internal/`.
- Wails-exposed methods in `app.go` must be exported (Capitalized).
- React components are `PascalCase` (`Profiles.tsx`, `ProfileCard`).
- TypeScript in `frontend/` uses 2-space indentation and single quotes in TS imports; follow existing file style.

## Testing Guidelines
- No automated tests are present.
- Manual test flow:
  1. Create a profile with env vars (mark some as secrets).
  2. Create a session from that profile.
  3. Verify session: `tmux ls`.
  4. Attach via UI and confirm `echo $VAR_NAME` in the terminal.

## Commit & Pull Request Guidelines
- Commits use short, imperative, sentence-case subjects (e.g., “Improve session attach handling”). Emoji prefixes appear occasionally; optional.
- PRs should include: a brief summary, test/verification steps, and screenshots/GIFs for UI changes. Link related issues when available.

## Security & Configuration Notes
- macOS-only; requires `tmux` to function.
- Secrets are stored in plain JSON at `~/.config/mole/profiles.json`; avoid real credentials in dev data.
