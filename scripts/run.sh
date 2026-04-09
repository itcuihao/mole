#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
DEFAULT_DEV_HOST=127.0.0.1
DEFAULT_DEV_PORT=3737
DEV_HOST="${MOLE_DEV_HOST:-$DEFAULT_DEV_HOST}"
DEV_PORT="${MOLE_DEV_PORT:-$DEFAULT_DEV_PORT}"
FRONTEND_DEV_SERVER_URL="http://${DEV_HOST}:${DEV_PORT}"

stop_dev_port_listener() {
    local port="$1"
    local pids
    local waited=0

    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -z "$pids" ]; then
        return 0
    fi

    echo -e "${YELLOW}⚠ Port ${port} is already in use, stopping existing listener...${NC}"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN || true

    while IFS= read -r pid; do
        [ -z "$pid" ] && continue
        kill "$pid" 2>/dev/null || true
    done <<< "$pids"

    while lsof -nP -iTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1 && [ "$waited" -lt 5 ]; do
        sleep 1
        waited=$((waited + 1))
    done

    if lsof -nP -iTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Port ${port} is still busy, forcing shutdown...${NC}"
        while IFS= read -r pid; do
            [ -z "$pid" ] && continue
            kill -9 "$pid" 2>/dev/null || true
        done <<< "$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
        sleep 1
    fi

    if lsof -nP -iTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1; then
        echo -e "${RED}✗ Failed to free port ${port}${NC}"
        lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
        exit 1
    fi

    echo -e "${GREEN}✓ Port ${port} is available${NC}"
}

echo "🕳️  Mole"
echo ""

# Check tmux
if ! command -v tmux &> /dev/null; then
    echo -e "${RED}✗ tmux not found${NC}"
    echo "  Install with: brew install tmux"
    exit 1
fi
echo -e "${GREEN}✓ tmux found${NC}"

# Check wails
if ! command -v wails &> /dev/null; then
    echo -e "${RED}✗ wails not found${NC}"
    echo "  Install with: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
    exit 1
fi
echo -e "${GREEN}✓ wails found${NC}"

if ! [[ "$DEV_PORT" =~ ^[0-9]+$ ]] || [ "$DEV_PORT" -lt 1 ] || [ "$DEV_PORT" -gt 65535 ]; then
    echo -e "${RED}✗ Invalid dev port: ${DEV_PORT}${NC}"
    echo "  Set MOLE_DEV_PORT to a value between 1 and 65535"
    exit 1
fi

export MOLE_DEV_HOST="$DEV_HOST"
export MOLE_DEV_PORT="$DEV_PORT"

# Check frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    # Check if package.json changed
    if [ "frontend/package.json" -nt "frontend/node_modules" ]; then
        echo -e "${YELLOW}⚠ package.json changed, updating dependencies...${NC}"
        cd frontend
        npm install
        cd ..
    fi
    echo -e "${GREEN}✓ Dependencies up to date${NC}"
fi

echo ""
echo "🚀 Starting Mole in development mode on ${FRONTEND_DEV_SERVER_URL}..."
echo ""

# Check frontend dev port before starting Wails. We pin Vite to the host/port above
# so Wails can proxy deterministically without localhost ambiguity.
stop_dev_port_listener "$DEV_PORT"

# Ensure app icon exists in build/ for Wails
if [ -f "assets/appicon.png" ]; then
    mkdir -p build
    cp assets/appicon.png build/appicon.png
else
    echo -e "${YELLOW}⚠ assets/appicon.png not found; using existing build icon if present${NC}"
fi

# Run wails dev
wails dev -frontenddevserverurl "$FRONTEND_DEV_SERVER_URL"
