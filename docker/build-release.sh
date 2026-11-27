#!/usr/bin/env bash
# Build the offline-capable release image (docker/Dockerfile.release).
#
# Each source is a local folder or a git URL, passed straight to a BuildKit named
# context. Defaults are the sibling working trees, so a local run is the CI build
# with only the dependency origins swapped; CI sets git URLs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_ROOT="$(dirname "${ROOT}")"

usage() {
  cat <<EOF
Usage: build-release.sh [-h] [-- <docker buildx build args...>]

Build docker/Dockerfile.release from tome + imp-ts + imp-graph-view sources.

Environment (each source: a folder, or https://github.com/<owner>/<repo>.git#<ref>):
  TOME_SOURCE            tome            (default: this checkout)
  IMP_TS_SOURCE          imp-ts          (default: sibling ../imp-ts)
  IMP_GRAPH_VIEW_SOURCE  imp-graph-view  (default: sibling ../imp-graph-view)
  IMAGE_TAG              image tag       (default: ghcr.io/silentorb/tome:local)

Legacy aliases: IMP_ROOT (= IMP_TS_SOURCE), IMP_GRAPH_VIEW_ROOT (= IMP_GRAPH_VIEW_SOURCE).

Arguments after -- are passed to docker buildx build (e.g. --cache-from/--cache-to).
The image is loaded into the local Docker image store.
EOF
}

extra_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args=("$@")
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

TOME_SOURCE="${TOME_SOURCE:-${ROOT}}"
IMP_TS_SOURCE="${IMP_TS_SOURCE:-${IMP_ROOT:-${DEV_ROOT}/imp-ts}}"
IMP_GRAPH_VIEW_SOURCE="${IMP_GRAPH_VIEW_SOURCE:-${IMP_GRAPH_VIEW_ROOT:-${DEV_ROOT}/imp-graph-view}}"
IMAGE_TAG="${IMAGE_TAG:-ghcr.io/silentorb/tome:local}"

is_remote() {
  [[ "$1" == *://* || "$1" == git@* ]]
}

# Print the context value for a source: remote sources pass through unchanged;
# folders must exist and contain <marker>, and are made absolute.
resolve_source() {
  local name="$1" value="$2" marker="$3"
  if is_remote "${value}"; then
    printf '%s\n' "${value}"
    return 0
  fi
  if [[ ! -e "${value}/${marker}" ]]; then
    echo "${name}=${value}: missing ${marker}." >&2
    echo "Clone the repo next to tome, or set ${name} to a folder or git URL." >&2
    return 1
  fi
  (cd "${value}" && pwd)
}

tome_ctx="$(resolve_source TOME_SOURCE "${TOME_SOURCE}" packages/tome-static-site)"
imp_ctx="$(resolve_source IMP_TS_SOURCE "${IMP_TS_SOURCE}" packages/imp-core-types)"
gv_ctx="$(resolve_source IMP_GRAPH_VIEW_SOURCE "${IMP_GRAPH_VIEW_SOURCE}" package.json)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH" >&2
  exit 1
fi

echo "Building ${IMAGE_TAG}"
echo "  tome:           ${tome_ctx}"
echo "  imp-ts:         ${imp_ctx}"
echo "  imp-graph-view: ${gv_ctx}"

exec docker buildx build \
  --file "${ROOT}/docker/Dockerfile.release" \
  --build-context "tome=${tome_ctx}" \
  --build-context "imp=${imp_ctx}" \
  --build-context "imp-graph-view=${gv_ctx}" \
  --tag "${IMAGE_TAG}" \
  --load \
  "${extra_args[@]}" \
  "${ROOT}"
