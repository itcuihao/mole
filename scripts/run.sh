#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🕳️  Mole - Terminal Environment Manager"
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
echo "🚀 Starting Mole in development mode..."
echo ""

# Ensure app icon exists in build/ for Wails
if [ -f "assets/appicon.png" ]; then
    mkdir -p build
    cp assets/appicon.png build/appicon.png
else
    echo -e "${YELLOW}⚠ assets/appicon.png not found; using existing build icon if present${NC}"
fi

# Run wails dev
wails dev
