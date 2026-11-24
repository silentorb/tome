#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${TOME_CONTENT_PATH:-}" && ! -d "$TOME_CONTENT_PATH" ]]; then
  echo "Content path not found: $TOME_CONTENT_PATH" >&2
  exit 1
fi

export TOME_EDITOR_DEV_HOST="${TOME_EDITOR_DEV_HOST:-0.0.0.0}"

# Prefer tome's node_modules when resolving peers for workspace packages that live
# outside this repo (e.g. imp-graph-view). Their node_modules may contain absolute
# symlinks from another workbench container that are broken here.
export NODE_PATH="${ROOT}/node_modules${NODE_PATH:+:$NODE_PATH}"

# Drop dangling peer symlinks under sibling workspace packages. Bun's import()
# prefers a local broken link over NODE_PATH; another workbench (e.g. aura) may
# leave absolute links into its own container paths that do not exist here.
prune_broken_peer_links() {
  local pkg_nm="$1"
  [[ -d "$pkg_nm" ]] || return 0
  local name
  for name in react react-dom @xyflow; do
    local link="$pkg_nm/$name"
    if [[ -L "$link" && ! -e "$link" ]]; then
      rm -f "$link"
    fi
  done
}
prune_broken_peer_links "$(cd "$ROOT/.." && pwd)/imp-graph-view/node_modules"

# shellcheck source=ensure-node-modules.sh
source "$(dirname "$0")/ensure-node-modules.sh"
exec bun run editor:dev
