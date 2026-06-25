#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=ensure-node-modules.sh
source "$(dirname "$0")/ensure-node-modules.sh"

exec bun -e "
import { openTomeWriteContext, resolveContentPath, defaultDbPathForContent } from 'tome-db/content';
const c = resolveContentPath();
const ctx = openTomeWriteContext(c, defaultDbPathForContent(c));
ctx.sync.fullRebuild();
ctx.db.close();
console.log('Synced', c);
"
