#!/usr/bin/env bash
# Release image entrypoint: toolbox for editor stack + utility scripts.
set -euo pipefail

TOME_ROOT="${TOME_ROOT:-/opt/tome}"
cd "${TOME_ROOT}"

ensure_deps() {
  # shellcheck source=/dev/null
  source "${TOME_ROOT}/scripts/ensure-node-modules.sh"
}

cmd="${1:-serve-dev}"
shift || true

case "${cmd}" in
  serve-dev)
    ensure_deps
    export TOME_EDITOR_DEV_HOST="${TOME_EDITOR_DEV_HOST:-0.0.0.0}"
    exec bun run editor:dev
    ;;
  content-sync)
    ensure_deps
    exec bash "${TOME_ROOT}/scripts/content-sync.sh"
    ;;
  test)
    ensure_deps
    exec bun run test
    ;;
  web:build)
    ensure_deps
    exec bun run web:build -- "$@"
    ;;
  run)
    ensure_deps
    exec bun "$@"
    ;;
  ensure-deps)
    ensure_deps
    ;;
  -h | --help | help)
    cat <<EOF
Usage: tome-entrypoint <command> [args...]

Commands:
  serve-dev       Start editor webview + API (default)
  content-sync    Rebuild SQLite cache from content
  test            Run tome test suite
  web:build       Run static site build (args after --)
  run <bun-args>  exec bun …
  ensure-deps     Seed/verify baked node_modules only
  help            Show this help

Any other command is executed as-is (exec "\$@").
EOF
    ;;
  *)
    # Passthrough for arbitrary tooling.
    exec "${cmd}" "$@"
    ;;
esac
