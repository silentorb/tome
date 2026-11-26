#!/usr/bin/env bash
# Bake tome + imp-ts + imp-graph-view dependencies at image build time (release only).
# Expects:
#   /opt/tome           — tome source tree
#   /opt/imp-ts         — imp-ts source tree (sibling; matches package.json workspaces)
#   /opt/imp-graph-view — imp-graph-view source tree (sibling; matches package.json workspaces)
# Writes /opt/tome/.baked-lock-hash and symlinks imp-ts node_modules.
set -euo pipefail

TOME_ROOT="${TOME_ROOT:-/opt/tome}"
IMP_ROOT="${IMP_ROOT:-/opt/imp-ts}"
IMP_GRAPH_VIEW_ROOT="${IMP_GRAPH_VIEW_ROOT:-/opt/imp-graph-view}"

if [[ ! -f "${TOME_ROOT}/bun.lock" ]]; then
  echo "bake-deps: missing ${TOME_ROOT}/bun.lock" >&2
  exit 1
fi
if [[ ! -d "${IMP_ROOT}/packages" ]]; then
  echo "bake-deps: missing Imp packages at ${IMP_ROOT}/packages" >&2
  exit 1
fi
if [[ ! -f "${IMP_GRAPH_VIEW_ROOT}/package.json" ]]; then
  echo "bake-deps: missing imp-graph-view at ${IMP_GRAPH_VIEW_ROOT}/package.json" >&2
  exit 1
fi

# shellcheck source=lib/lockfile-hash.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lockfile-hash.sh"
# shellcheck source=lib/imp-symlink.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/imp-symlink.sh"

# Host workbench often symlinks imp-ts/node_modules → tome/node_modules or leaves
# container-specific peer symlinks under imp-graph-view/node_modules.
rm -rf "${TOME_ROOT}/node_modules" "${IMP_ROOT}/node_modules" "${IMP_GRAPH_VIEW_ROOT}/node_modules"

# Tome workspaces include ../imp-ts/packages/* and ../imp-graph-view; one install covers all trees.
cd "${TOME_ROOT}"
bun install --frozen-lockfile

tome_imp_symlink "${TOME_ROOT}" "${IMP_ROOT}"
tome_imp_graph_view_symlink "${TOME_ROOT}" "${IMP_GRAPH_VIEW_ROOT}"

tome_lockfile_hash "${TOME_ROOT}" "${IMP_ROOT}" "${IMP_GRAPH_VIEW_ROOT}" >"${TOME_ROOT}/.baked-lock-hash"
echo "bake-deps: wrote ${TOME_ROOT}/.baked-lock-hash"
