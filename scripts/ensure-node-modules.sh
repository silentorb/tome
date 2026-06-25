#!/usr/bin/env bash
# Named Docker volumes mount as root:root; bun install runs as vscode.
if [[ ! -d node_modules ]] || [[ ! -w node_modules ]]; then
  sudo mkdir -p node_modules
  sudo chown "$(id -u):$(id -g)" node_modules
fi

# Parallel `bun install` calls race on .bin symlinks (EEXIST) and can exit 1.
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_lock="$(cd "$_script_dir/.." && pwd)/.bun-install.lock"
(
  exec 200>"$install_lock"
  flock 200
  bun install --frozen-lockfile
)
