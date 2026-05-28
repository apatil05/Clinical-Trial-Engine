#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but not found."
  echo "Install Node.js + npm, then rerun this script."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

echo "Starting frontend at http://127.0.0.1:5173"
npm run dev -- --host 127.0.0.1 --port 5173
