FROM mcr.microsoft.com/devcontainers/base:debian AS base

RUN <<EOF
mkdir -p /workspaces/dev /workspaces/build
chown vscode:vscode /workspaces/dev /workspaces/build
EOF

RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl unzip python3
apt-get upgrade -y
rm -rf /var/lib/apt/lists/*
EOF

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
USER root
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13"

USER root
WORKDIR /opt/tome
COPY package.json bun.lock bunfig.toml ./
COPY packages packages
RUN chown -R vscode:vscode /opt/tome
USER vscode
RUN bun install

WORKDIR /workspaces/tome
CMD ["/bin/bash", "-c", "cd /workspaces/tome && bun install --frozen-lockfile && exec bun run editor:dev"]
