#!/usr/bin/env bash
# Release image: seed node_modules from the bake; never fetch from the network.
# Installed as /opt/tome/scripts/ensure-node-modules.sh (and under /opt/tome-baked).
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_root="$(cd "${_script_dir}/.." && pwd)"

BAKED_ROOT="${TOME_BAKED_ROOT:-/opt/tome-baked}"
IMP_ROOT="${IMP_ROOT:-/opt/imp-ts}"

# Prefer helpers from the immutable bake (survive bind mounts over /opt/tome).
_lib_dir="${BAKED_ROOT}/docker/lib"
if [[ ! -d "${_lib_dir}" ]]; then
  _lib_dir="${_root}/docker/lib"
fi
# shellcheck source=lib/lockfile-hash.sh
source "${_lib_dir}/lockfile-hash.sh"
# shellcheck source=lib/imp-symlink.sh
source "${_lib_dir}/imp-symlink.sh"

if [[ ! -f "${BAKED_ROOT}/.baked-lock-hash" ]]; then
  echo "ensure-deps-release: missing ${BAKED_ROOT}/.baked-lock-hash (not a release image?)" >&2
  exit 1
fi

expected="$(cat "${BAKED_ROOT}/.baked-lock-hash")"
actual="$(tome_lockfile_hash "${_root}" "${IMP_ROOT}")"

if [[ "${actual}" != "${expected}" ]]; then
  cat >&2 <<EOF
ensure-deps-release: lockfile changed since image build.
Rebuild the release image (docker/Dockerfile.release) to pick up dependency changes.
  baked:   ${expected}
  current: ${actual}
EOF
  exit 1
fi

# Bind mounts can hide baked node_modules; copy from immutable seed.
if [[ ! -d "${_root}/node_modules/.bin" ]]; then
  if [[ ! -d "${BAKED_ROOT}/node_modules" ]]; then
    echo "ensure-deps-release: missing ${BAKED_ROOT}/node_modules" >&2
    exit 1
  fi
  echo "ensure-deps-release: seeding node_modules from ${BAKED_ROOT}"
  mkdir -p "${_root}/node_modules"
  # Prefer cp -a; fall back if attributes fail on some mounts.
  cp -a "${BAKED_ROOT}/node_modules/." "${_root}/node_modules/" || \
    cp -R "${BAKED_ROOT}/node_modules/." "${_root}/node_modules/"
fi

tome_imp_symlink "${_root}" "${IMP_ROOT}"
