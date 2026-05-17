#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${MOLE_WORKSPACE:-$HOME}"

cd "$WORKSPACE"
mkdir -p .claude

code .
