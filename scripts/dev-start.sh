#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${TOME_CONTENT_PATH:-}" && ! -d "$TOME_CONTENT_PATH" ]]; then
  echo "Content path not found: $TOME_CONTENT_PATH" >&2
  exit 1
fi

export TOME_EDITOR_DEV_HOST="${TOME_EDITOR_DEV_HOST:-0.0.0.0}"

# shellcheck source=ensure-node-modules.sh
source "$(dirname "$0")/ensure-node-modules.sh"
exec bun run editor:dev
