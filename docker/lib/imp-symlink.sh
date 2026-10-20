#!/usr/bin/env bash
# Point imp-ts/node_modules at tome's hoisted tree when Imp has no install of its own.
# Also drop dangling per-package node_modules symlinks (e.g. from a sibling
# tome-neo4j bun install that linked into an unmounted .bun store) so Bun can
# fall through to the hoisted tree instead of ENOENT on every import.
# Usage: tome_imp_symlink <tome_root> [imp_root]
tome_imp_symlink() {
  local tome_root="$1"
  local imp_root="${2:-}"
  local imp_nm
  local pkg_nm
  local link

  if [[ -z "${imp_root}" ]]; then
    if [[ -n "${IMP_ROOT:-}" ]]; then
      imp_root="${IMP_ROOT}"
    else
      imp_root="$(cd "${tome_root}/../imp-ts" 2>/dev/null && pwd)" || imp_root=""
    fi
  fi

  if [[ -z "${imp_root}" || ! -d "${imp_root}/packages" ]]; then
    return 0
  fi

  imp_nm="${imp_root}/node_modules"
  if [[ ! -e "${imp_nm}" || -L "${imp_nm}" ]]; then
    ln -sfn "${tome_root}/node_modules" "${imp_nm}"
  fi

  shopt -s nullglob
  for pkg_nm in "${imp_root}"/packages/*/node_modules; do
    [[ -d "${pkg_nm}" ]] || continue
    for link in "${pkg_nm}"/* "${pkg_nm}"/.[!.]* "${pkg_nm}"/..?*; do
      [[ -L "${link}" ]] || continue
      if [[ ! -e "${link}" ]]; then
        rm -f "${link}"
      fi
    done
  done
  shopt -u nullglob
}
