#!/usr/bin/env bash
# Validate a release image offline: seeded deps check, then the full weighted test suite.
# Same check CI runs before publishing (.github/workflows/container.yml).
set -euo pipefail

usage() {
  cat <<EOF
Usage: validate-release.sh [-h] [image]

Run the release image with --network none: ensure-deps, then test.

  image   Image to validate (default: \$IMAGE_TAG or ghcr.io/silentorb/tome:local)

The test step runs tome's full suite; run it on its own, not alongside other heavy jobs.
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac

image="${1:-${IMAGE_TAG:-ghcr.io/silentorb/tome:local}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH" >&2
  exit 1
fi

echo "Validating ${image} offline"
docker run --rm --network none "${image}" ensure-deps
docker run --rm --network none "${image}" test
