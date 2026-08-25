#!/usr/bin/env bash
# Named Docker volumes mount as root:root; bun install runs as vscode.
if [[ ! -d node_modules ]] || [[ ! -w node_modules ]]; then
  sudo mkdir -p node_modules
  sudo chown "$(id -u):$(id -g)" node_modules
fi

# Parallel `bun install` calls race on .bin symlinks (EEXIST) and can exit 1.
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_root="$(cd "$_script_dir/.." && pwd)"
install_lock="$_root/.bun-install.lock"
(
  exec 200>"$install_lock"
  flock 200
  bun install --frozen-lockfile
)

# Hoisted installs put deps under tome/node_modules, but Imp packages live outside
# that tree (../imp). Bun resolves bare imports by walking up from the importing
# file, so point imp/node_modules at tome's hoisted tree when Imp has no install
# of its own.
_imp_root="$(cd "$_root/../imp" 2>/dev/null && pwd)" || _imp_root=""
if [[ -n "$_imp_root" && -d "$_imp_root/packages" ]]; then
  _imp_nm="$_imp_root/node_modules"
  if [[ ! -e "$_imp_nm" || -L "$_imp_nm" ]]; then
    ln -sfn "$_root/node_modules" "$_imp_nm"
  fi
fi
