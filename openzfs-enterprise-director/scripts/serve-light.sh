#!/usr/bin/env bash
# Serve the built panel with Node only. Vite stays out of the running process.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

need_build=0
if [ ! -f dist/index.html ]; then
  need_build=1
elif find src server.ts index.html vite.config.ts -newer dist/index.html -print -quit | grep -q .; then
  need_build=1
fi

if [ "$need_build" -eq 1 ]; then
  echo "Building the panel once, then serving the static files."
  npx vite build
fi

export NODE_ENV=production
export PORT="${PORT:-3000}"
exec node --experimental-strip-types --max-old-space-size=128 server.ts
