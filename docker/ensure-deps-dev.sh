#!/usr/bin/env bash
# Dev image / workbench: install deps at runtime when lockfile or node_modules needs sync.
# Sourced by scripts/ensure-node-modules.sh (and run-in-tome.sh).
set -euo pipefail

# Resolve tome root: prefer caller cwd when it looks like the repo, else parent of docker/.
_this="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${_this}/../package.json" && -f "${_this}/../bun.lock" ]]; then
  _root="$(cd "${_this}/.." && pwd)"
  _docker_dir="${_this}"
elif [[ -f "${PWD}/package.json" && -f "${PWD}/bun.lock" ]]; then
  _root="${PWD}"
  _docker_dir="${_root}/docker"
else
  _root="$(cd "${_this}/.." && pwd)"
  _docker_dir="${_root}/docker"
fi

# shellcheck source=lib/imp-symlink.sh
source "${_docker_dir}/lib/imp-symlink.sh"

# Named Docker volumes mount as root:root; bun install runs as vscode / non-root.
if [[ ! -d "${_root}/node_modules" ]] || [[ ! -w "${_root}/node_modules" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p "${_root}/node_modules"
    sudo chown "$(id -u):$(id -g)" "${_root}/node_modules"
  else
    mkdir -p "${_root}/node_modules"
  fi
fi

# Parallel `bun install` calls race on .bin symlinks (EEXIST) and can exit 1.
install_lock="${_root}/.bun-install.lock"
(
  exec 200>"${install_lock}"
  flock 200
  cd "${_root}"
  bun install --frozen-lockfile
)

tome_imp_symlink "${_root}" "${IMP_ROOT:-}"

# Sibling workspace packages outside this repo (e.g. imp-graph-view) keep their
# node_modules on the shared host checkout. Another workbench's install (e.g.
# imp-lab's link-graph-view-peers postinstall in aura) can leave absolute peer
# symlinks into its own container paths that do not resolve here. tsc and Bun
# resolve peers from the package directory (not NODE_PATH), so re-point missing
# or dangling peers at tome's copies to keep one React / React Flow root.
tome_relink_sibling_peers() {
  local root="$1" pkg_nm="$2" name link target
  [[ -d "$pkg_nm" ]] || return 0
  for name in react react-dom @xyflow @types/react @types/react-dom; do
    link="${pkg_nm}/${name}"
    target="${root}/node_modules/${name}"
    if [[ ! -e "$link" && -e "$target" ]]; then
      mkdir -p "$(dirname "$link")"
      ln -sfn "$target" "$link"
    fi
  done
}
tome_relink_sibling_peers "${_root}" "$(cd "${_root}/.." && pwd)/imp-graph-view/node_modules"
