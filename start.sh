#!/bin/bash
echo "=== Starting FC SMS ==="

# Start API
echo "→ Starting API on http://localhost:4000 ..."
cd apps/api
npx ts-node -r tsconfig-paths/register src/index.ts &
API_PID=$!
cd ../..

# Wait a moment
sleep 2

# Start Web
echo "→ Starting Web on http://localhost:5173 ..."
cd apps/web
npx vite --port 5173 &
WEB_PID=$!
cd ../..

echo ""
echo "✅ Both servers running!"
echo "   → Open http://localhost:5173 in your browser"
echo "   → Login: 9999999999 / admin123"
echo ""
echo "Press Ctrl+C to stop."
trap "kill $API_PID $WEB_PID 2>/dev/null" EXIT
wait
