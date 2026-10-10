#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for dependency in uv cargo npm; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Missing $dependency. See docs/visual-dynamics.md for prerequisites." >&2
    exit 1
  fi
done

# The server uses Vite during development; no bundled UI build is needed.
export OMNIGENT_SKIP_WEB_UI=true
unset VIRTUAL_ENV
uv sync --frozen --extra all --group dev

# Supply the repository's Node/pnpm versions without changing global installs.
exec npm exec --yes --package=node@22 --package=pnpm@11.15.1 -- \
  cargo run --locked --manifest-path dev/omnidev/Cargo.toml -- \
  --headless --no-open --no-fixtures "$@"
