#!/usr/bin/env bash
# Portable launcher. Unpack the zip, install Node.js 18+, then run: ./start.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install it, then run ./start.sh again."
  exit 1
fi

export NODE_ENV=production
export PORT="${PORT:-3000}"
echo "OpenZFS Enterprise Director on http://0.0.0.0:${PORT}"
exec node server.cjs
