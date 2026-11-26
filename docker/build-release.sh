#!/usr/bin/env bash
# Build the offline-capable release image with BuildKit named contexts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMP_ROOT="${IMP_ROOT:-$(cd "${ROOT}/../imp-ts" 2>/dev/null && pwd || true)}"
IMP_GRAPH_VIEW_ROOT="${IMP_GRAPH_VIEW_ROOT:-$(cd "${ROOT}/../imp-graph-view" 2>/dev/null && pwd || true)}"
IMAGE_TAG="${IMAGE_TAG:-ghcr.io/silentorb/tome:local}"

usage() {
  cat <<EOF
Usage: build-release.sh [-h]

Build docker/Dockerfile.release with tome + imp-ts + imp-graph-view named contexts.

Environment:
  IMP_ROOT             Path to silentorb/imp-ts (default: sibling ../imp-ts)
  IMP_GRAPH_VIEW_ROOT  Path to silentorb/imp-graph-view (default: sibling ../imp-graph-view)
  IMAGE_TAG            Image tag (default: ghcr.io/silentorb/tome:local)
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac

if [[ -z "${IMP_ROOT}" || ! -d "${IMP_ROOT}/packages" ]]; then
  echo "imp-ts not found at IMP_ROOT=${IMP_ROOT:-}" >&2
  echo "Checkout silentorb/imp-ts as a sibling of tome or set IMP_ROOT." >&2
  exit 1
fi

if [[ -z "${IMP_GRAPH_VIEW_ROOT}" || ! -f "${IMP_GRAPH_VIEW_ROOT}/package.json" ]]; then
  echo "imp-graph-view not found at IMP_GRAPH_VIEW_ROOT=${IMP_GRAPH_VIEW_ROOT:-}" >&2
  echo "Checkout silentorb/imp-graph-view as a sibling of tome or set IMP_GRAPH_VIEW_ROOT." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH" >&2
  exit 1
fi

echo "Building ${IMAGE_TAG}"
echo "  tome:           ${ROOT}"
echo "  imp:            ${IMP_ROOT}"
echo "  imp-graph-view: ${IMP_GRAPH_VIEW_ROOT}"

DOCKER_BUILDKIT=1 docker build \
  -f "${ROOT}/docker/Dockerfile.release" \
  --build-context "tome=${ROOT}" \
  --build-context "imp=${IMP_ROOT}" \
  --build-context "imp-graph-view=${IMP_GRAPH_VIEW_ROOT}" \
  -t "${IMAGE_TAG}" \
  "${ROOT}"
