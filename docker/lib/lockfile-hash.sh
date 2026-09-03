#!/usr/bin/env bash
# Compute a stable fingerprint of tome (+ optional imp-ts) lockfiles.
# Usage: tome_lockfile_hash <tome_root> [imp_root]
tome_lockfile_hash() {
  local tome_root="$1"
  local imp_root="${2:-}"
  local files=()

  if [[ -f "${tome_root}/bun.lock" ]]; then
    files+=("${tome_root}/bun.lock")
  fi
  if [[ -f "${tome_root}/package.json" ]]; then
    files+=("${tome_root}/package.json")
  fi
  if [[ -n "${imp_root}" && -f "${imp_root}/bun.lock" ]]; then
    files+=("${imp_root}/bun.lock")
  fi
  if [[ -n "${imp_root}" && -f "${imp_root}/package.json" ]]; then
    files+=("${imp_root}/package.json")
  fi

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "tome_lockfile_hash: no lockfiles found" >&2
    return 1
  fi

  # Sort paths for stability; hash file contents.
  printf '%s\0' "${files[@]}" | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}
