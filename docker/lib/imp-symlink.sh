#!/usr/bin/env bash
# Point imp-ts/node_modules at tome's hoisted tree when Imp has no install of its own.
# Usage: tome_imp_symlink <tome_root> [imp_root]
tome_imp_symlink() {
  local tome_root="$1"
  local imp_root="${2:-}"
  local imp_nm

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
}
