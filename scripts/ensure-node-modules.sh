#!/usr/bin/env bash
# Stable entrypoint for dependency ensure.
# Workbench / git tree: sources docker/ensure-deps-dev.sh (runtime bun install).
# Release image: this file is replaced at bake time with ensure-deps-release.sh.
set -euo pipefail

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../docker/ensure-deps-dev.sh
source "${_script_dir}/../docker/ensure-deps-dev.sh"
