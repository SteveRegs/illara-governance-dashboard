#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: scripts/release-dashboard.sh 20260107a"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX="$ROOT_DIR/dashboard/index.html"
APP="$ROOT_DIR/dashboard/app.js"
VERFILE="$ROOT_DIR/dashboard/version.txt"

if [[ ! -f "$INDEX" || ! -f "$APP" ]]; then
  echo "Error: expected dashboard/index.html and dashboard/app.js"
  exit 1
fi

echo "==> Releasing dashboard version: $VERSION"

# 1) version.txt
printf "%s\n" "$VERSION" > "$VERFILE"

# 2) index.html: const BUILD = "..."
# Replace the first occurrence of: const BUILD = "....";
perl -0777 -i -pe "s/const\\s+BUILD\\s*=\\s*\"[^\"]+\";/const BUILD = \"$VERSION\";/m" "$INDEX"

# 3) index.html: script cache-busters (ONLY update the v=... part)
perl -0777 -i -pe "s#(<script\\s+src=\"\\./env\\.public\\.js\\?v=)[^\"]*(\"\\s*></script>)#\${1}$VERSION\${2}#g" "$INDEX"
perl -0777 -i -pe "s#(<script\\s+src=\"\\./ui\\.js\\?v=)[^\"]*(\"\\s*></script>)#\${1}$VERSION\${2}#g" "$INDEX"
perl -0777 -i -pe "s#(<script\\s+src=\"\\./app\\.js\\?v=)[^\"]*(\"\\s*></script>)#\${1}$VERSION\${2}#g" "$INDEX"

# 3.5) Guardrails: never allow broken script src values
if grep -nE '<script\s+src="[^./][^"]*"' "$INDEX" >/dev/null; then
  echo "ERROR: index.html contains broken script src=\"b\". Aborting."
  grep -nE '<script\s+src="b"' "$INDEX" || true
  exit 1
fi

# Ensure our three cache-busted script tags exist
for f in env.public.js ui.js app.js; do
  if ! grep -q "./$f?v=$VERSION" "$INDEX"; then
    echo "ERROR: Missing expected cache-busted tag for $f (v=$VERSION). Aborting."
    grep -n "$f?v=" "$INDEX" || true
    exit 1
  fi
done

# 4) app.js: window.__APP_VERSION__ = "..."
perl -0777 -i -pe "s/window\\.__APP_VERSION__\\s*=\\s*\"[^\"]+\";/window.__APP_VERSION__ = \"$VERSION\";/m" "$APP"

echo "==> Sanity checks"
echo -n "version.txt: " && tr -d '\n' < "$VERFILE" && echo

grep -n "const BUILD" "$INDEX" | head -1 || true
grep -n "env.public.js?v=" "$INDEX" | head -1 || true
grep -n "ui.js?v=" "$INDEX" | head -1 || true
grep -n "app.js?v=" "$INDEX" | head -1 || true
grep -n "window.__APP_VERSION__" "$APP" | head -2 || true

echo "==> Git status"
git status --porcelain

echo "==> Commit + push"
git add "$VERFILE" "$INDEX" "$APP"
git commit -m "Release dashboard ${VERSION}"
git push

echo "==> Done."
