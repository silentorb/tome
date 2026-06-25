FROM mcr.microsoft.com/devcontainers/base:debian AS base

RUN <<EOF
mkdir -p /workspaces/dev /workspaces/build
chown vscode:vscode /workspaces/dev /workspaces/build
EOF

RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl unzip python3 \
  build-essential pkg-config \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev libpixman-1-dev
apt-get upgrade -y
rm -rf /var/lib/apt/lists/*
EOF

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
USER root
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13"

USER vscode
CMD ["sleep", "infinity"]
