#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v python3.11 >/dev/null 2>&1; then
  echo "Error: python3.11 is required but not found."
  echo "Install Python 3.11, then rerun this script."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Creating backend virtual environment..."
  python3.11 -m venv .venv
fi

source .venv/bin/activate

if ! python -c "import fastapi, uvicorn, openai, httpx, supabase, dotenv, pydantic" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  pip install -r requirements.txt
fi

echo "Starting backend at http://127.0.0.1:8000"
uvicorn main:app --reload --host 127.0.0.1 --port 8000
