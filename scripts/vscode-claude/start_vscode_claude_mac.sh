#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="${PROJECT_DIR:-$HOME/mygo/mole}"
CONFIG_FILE="${HOME}/.config/mole/vscode-claude.env"

[[ -f "$CONFIG_FILE" ]] || { echo "缺少配置: $CONFIG_FILE"; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"

cd "$PROJECT_DIR"
mkdir -p .claude
code "$PROJECT_DIR"
