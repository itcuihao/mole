# Mole

```
┌┬┐┌─┐╷  ┌─╴
││││ ││  ├╴
╵ ╵└─┘└─╴└─╴
```

**Terminal Environment Manager for macOS**

Mole is a desktop application that manages tmux sessions with profile-based environment configurations. Create isolated terminal environments with different environment variables, secrets, and startup commands.

## Features

- **Profile Management**: Create reusable environment profiles with variables and secrets
- **Session Control**: Launch and manage tmux sessions with specific profiles
- **Secure Storage**: Secrets stored safely in macOS Keychain
- **Modern UI**: Clean, theme-aware interface with light/dark mode
- **Bulk Import**: Import environment variables from `.env` files, JSON, or shell exports

## Tech Stack

- **Backend**: Go + Wails v2
- **Frontend**: React 19 + TypeScript + Vite
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Storage**: SQLite + macOS Keychain

## Development

### Quick Start

```bash
# Run in development mode (auto-checks dependencies)
./scripts/run.sh

# Build for production
./scripts/build.sh
```

### Manual Commands

```bash
# Install dependencies
cd frontend && npm install

# Run in development mode
wails dev

# Build for production
wails build
```

## Usage

### 1. Create a Profile

Go to the **Profiles** tab and create a new profile:
- Set a name and color
- Add environment variables (key-value pairs)
- Mark sensitive values as secrets (stored in Keychain)
- Use bulk import for existing `.env` files

### 2. Create a Session

Go to the **Sessions** tab and create a new session:
- Select a profile
- Set a session name
- Optionally specify a startup command
- Click "Create" to launch the tmux session

### 3. Attach to Session

Click "Attach" on any session card to open it in a new Terminal window.

## Environment Variable Formats

Mole supports multiple import formats:

```bash
# Simple format
KEY=value
API_KEY="secret-value"

# Export format
export DATABASE_URL=postgresql://localhost

# JSON format
{"KEY": "value", "API_KEY": "secret"}
```

## License

MIT

## Author

Built with Claude Code
