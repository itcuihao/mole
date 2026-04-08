#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🕳️  Mole - Building for production"
echo ""

# Check wails
if ! command -v wails &> /dev/null; then
    echo -e "${RED}✗ wails not found${NC}"
    echo "  Install with: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
    exit 1
fi

# Check frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⚠ Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
fi

echo "🔨 Building production binary..."
echo ""

# Ensure app icon exists in build/ for Wails
if [ -f "assets/appicon.png" ]; then
    mkdir -p build
    cp assets/appicon.png build/appicon.png
else
    echo -e "${YELLOW}⚠ assets/appicon.png not found; using existing build icon if present${NC}"
fi

# Build
wails build

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo "  Binary: build/bin/mole.app"
echo ""
echo "To run: open build/bin/mole.app"
