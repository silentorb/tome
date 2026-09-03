#!/usr/bin/env bash
# Shared OS toolchain + Bun for Dockerfile.base and Dockerfile.dev.
# Must run as root. Idempotent enough for layer rebuilds.
set -euo pipefail

BUN_VERSION="${BUN_VERSION:-1.3.13}"
BUN_INSTALL="${BUN_INSTALL:-/usr/local/bun}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl unzip python3 \
  build-essential pkg-config \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev libpixman-1-dev
apt-get upgrade -y
rm -rf /var/lib/apt/lists/*

export BUN_INSTALL
curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

# Ensure bun is on PATH for subsequent Dockerfile RUN layers.
ln -sfn "${BUN_INSTALL}/bin/bun" /usr/local/bin/bun
ln -sfn "${BUN_INSTALL}/bin/bunx" /usr/local/bin/bunx
# TypeScript and other package bins use #!/usr/bin/env node — Bun is the Node runtime here.
ln -sfn "${BUN_INSTALL}/bin/bun" /usr/local/bin/node
