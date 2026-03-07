#!/usr/bin/env bash
set -euo pipefail

npx --yes esbuild supabase/functions/harness-run/index.ts \
  --loader:.ts=ts \
  --target=es2020 \
  --log-level=warning \
  --outfile=/dev/null

echo "OK: harness-run parses cleanly (esbuild)."

