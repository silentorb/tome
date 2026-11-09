#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=ensure-node-modules.sh
source "$(dirname "$0")/ensure-node-modules.sh"

# Force-rebuild SQLite cache from flatfile (awaits openContentGraph / openDataStoreSession).
# Solo: TOME_CONTENT_PATH + optional TOME_DB_PATH
# Multi-corpus session: TOME_CORPORA + TOME_DB_PATH (see workbench scripts/session-content-sync.sh)
exec bun packages/tome-db/scripts/content-sync.ts
