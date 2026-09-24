#!/bin/bash
# FC SMS — double-click to start
cd "$(dirname "$0")"

# Check for Node.js
if ! command -v node &>/dev/null; then
  osascript -e 'display alert "Node.js not found" message "Please install Node.js from https://nodejs.org (LTS version) and try again." buttons {"OK"} default button "OK"'
  exit 1
fi

echo "=== FC SMS Starting ==="
echo ""

# Install deps if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first run — takes ~1 minute)..."
  npm install --legacy-peer-deps 2>&1
  if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check your internet connection."
    read -p "Press Enter to exit..."
    exit 1
  fi
fi

# Kill anything on ports 4000 and 5173
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

echo "Starting API server on port 4000..."
cd apps/api
npx ts-node -r tsconfig-paths/register src/index.ts &
API_PID=$!
cd ../..

sleep 3

echo "Starting web app on port 5173..."
cd apps/web
npx vite --host 0.0.0.0 &
WEB_PID=$!
cd ../..

sleep 3

echo ""
echo "======================================"
echo "  FC SMS is running!"
echo "  Open: http://localhost:5173"
echo ""
echo "  Login:"
echo "    Super Admin: 9999999999 / admin123"
echo "    Store Admin: 9876543210 / admin123"
echo ""
echo "  Press Ctrl+C to stop"
echo "======================================"

# Open browser
sleep 2
open http://localhost:5173

# Wait
wait $API_PID $WEB_PID
