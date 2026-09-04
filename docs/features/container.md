# Container (dev and release images)

## Summary

Tome ships **three Dockerfiles** under [`docker/`](../../docker/) with shared shell abstractions:

| Image | Dockerfile | Published? | Dependency model |
| --- | --- | --- | --- |
| **base** | `Dockerfile.base` | No (internal layer) | OS + Bun + canvas native libs only |
| **dev** | `Dockerfile.dev` | No (local / workbench) | Runtime `bun install` against bind-mounted source |
| **release** | `Dockerfile.release` | **Yes → GHCR** | All deps baked at build time; offline at runtime |

Dev vs release behavior is **structural** (separate Dockerfiles and ensure scripts), not an environment toggle.

## When to read this

- Adding or changing container build/CI
- Consuming `ghcr.io/silentorb/tome` from another repo
- Debugging workbench `tome` Compose service image builds
- Air-gapped / locked-down deployment of the editor stack

## Requirements

- **Release must be offline after build.** No `bun install`, `apt-get`, or registry fetch at runtime. CI must validate with `docker run --network none`.
- **Dev must support agent iteration.** Lockfile changes install at container start / via `run-in-tome.sh` without rebuilding the image.
- **Shared patterns live in scripts**, not copied RUN blocks: `install-runtime.sh`, `bake-deps.sh`, `docker/lib/*`.
- **Imp is a sibling.** Release bake and workspaces expect `imp-ts` next to `tome` (`../imp-ts` / `/opt/imp-ts`).

## Design rationale

Workbench agents change lockfiles often; forcing an image rebuild each time is too slow. Downstream CI and locked-down hosts need a single self-contained image. Splitting **dev** and **release** keeps both workflows honest without a mode flag that could ship the wrong behavior.

## Behavior / pipeline

```
install-runtime.sh ──► Dockerfile.base
                   └─► Dockerfile.dev  (workbench Compose)

install-runtime.sh ──► Dockerfile.release (base stage)
bake-deps.sh       ──► Dockerfile.release (deps stage)
ensure-deps-release.sh + entrypoint-release.sh ──► GHCR image
```

### Dev (workbench)

1. Compose builds `docker/Dockerfile.dev` from the mounted tome repo.
2. Source + `tome-node-modules` volume are bind-mounted.
3. `scripts/dev-start.sh` → `scripts/ensure-node-modules.sh` → `docker/ensure-deps-dev.sh` → `bun install --frozen-lockfile` → `editor:dev`.
4. Ports **5173** (Vite) and **3847** (API).

### Release (GHCR)

1. CI checks out tome + `silentorb/imp-ts` (ref `vars.IMP_REF` or `main`).
2. BuildKit named contexts `tome` + `imp` feed `Dockerfile.release`.
3. `bake-deps.sh` runs `bun install --frozen-lockfile` and writes `.baked-lock-hash`.
4. Image layout:
   - `/opt/tome` — working tree (source + `node_modules`)
   - `/opt/tome-baked` — immutable seed (same tree; used if a bind mount hides `node_modules`)
   - `/opt/imp-ts` — baked Imp sibling
5. Entrypoint validates lockfile hash; on drift, **fails** with rebuild instructions (never fetches).
6. Publish `ghcr.io/silentorb/tome` **only** for git tags matching `v*` (semver + `major.minor`). Pushes to `main` do not publish an image.

### Semver image tags ↔ root version

GHCR semver tags come from **git tags** matching `v*` (e.g. `v0.1.0`), not from workspace package versions under `packages/*`.

- The **repo-root** `package.json` `"version"` is the release / container version.
- Agents create a **local** annotated tag `v<version>` after a release commit when the user says **commit and tag tome** (`bash scripts/git-tag-version.sh tome` from silentorb-workbench). Ordinary package bumps do **not** create tags.
- **Push is manual** — push the annotated `v*` tag (and its commit) when you want CI to publish. Agents do not push. Ordinary pushes to `main` do not build or publish GHCR images.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| `ghcr.io/silentorb/tome:<tag>` | Release image for consumers |
| `.baked-lock-hash` | Lockfile fingerprint inside the release image |
| `docker/build-release.sh` | Local release build helper |

## Quick start

**Dev image (local):**

```bash
docker build -f docker/Dockerfile.dev -t tome-dev:local .
```

**Release image (local, needs sibling imp-ts):**

```bash
bash docker/build-release.sh
# or: IMP_ROOT=/path/to/imp-ts IMAGE_TAG=ghcr.io/silentorb/tome:local bash docker/build-release.sh
```

**Run release offline:**

```bash
docker run --rm --network none \
  -e TOME_CONTENT_PATH=/path/in/container/content \
  -e TOME_DB_PATH=/tmp/tome.sqlite \
  -v /host/content:/content:ro \
  ghcr.io/silentorb/tome:0.1.0 \
  test
```

**Entrypoint commands:** `serve-dev` (default), `content-sync`, `test`, `web:build`, `run <bun-args>`, `ensure-deps`, or any passthrough command.

**Air-gap without registry:**

```bash
docker save ghcr.io/silentorb/tome:0.1.0 | gzip > tome-release.tar.gz
# on the target host:
gunzip -c tome-release.tar.gz | docker load
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `TOME_CONTENT_PATH` | Solo corpus content root |
| `TOME_CORPORA` | Multi-corpus session spec |
| `TOME_DB_PATH` | SQLite cache path |
| `TOME_EDITOR_DEV_HOST` | Vite bind host (default `0.0.0.0` in containers) |
| `TOME_EDITOR_API_PORT` | API port (default 3847) |
| `IMP_ROOT` | Imp sibling path (default `/opt/imp-ts` in release) |
| `TOME_BAKED_ROOT` | Immutable bake path (default `/opt/tome-baked`) |
| `IMP_REF` (CI var) | imp-ts git ref when building the release image |

## Verification

- Release CI: `.github/workflows/container.yml` runs on `v*` tags (and `workflow_dispatch` of a `v*` ref), builds release, runs `ensure-deps` + `test` with `--network none`, then pushes semver tags.
- Offline `test` runs root `bun run test` → **weighted** essential/nonessential gating (see [`testing.md`](./testing.md)).
- Dev: open workbench / rebuild Compose `tome` service after `docker/` toolchain changes.
- Lockfile drift on release: change `bun.lock` / `package.json` under the working tree → `ensure-deps` must exit non-zero.

## Implementation pointers

| Path | Role |
| --- | --- |
| [`docker/install-runtime.sh`](../../docker/install-runtime.sh) | apt + Bun pin (base + dev + release base stage) |
| [`docker/bake-deps.sh`](../../docker/bake-deps.sh) | Release-only dependency bake |
| [`docker/ensure-deps-dev.sh`](../../docker/ensure-deps-dev.sh) | Runtime install for workbench |
| [`docker/ensure-deps-release.sh`](../../docker/ensure-deps-release.sh) | Offline seed / lockfile check |
| [`docker/entrypoint-release.sh`](../../docker/entrypoint-release.sh) | Release CMD dispatch |
| [`docker/build-release.sh`](../../docker/build-release.sh) | Local BuildKit build with named contexts |
| [`scripts/ensure-node-modules.sh`](../../scripts/ensure-node-modules.sh) | Stable caller; sources ensure-deps-dev in git tree |

## See also

- [tome-editor.md](./tome-editor.md) — editor webview + API ports
- [tome-server.md](./tome-server.md) — API host
- [multi-corpus.md](./multi-corpus.md) — `TOME_CORPORA`
- Workbench Compose: `silentorb-workbench/.devcontainer/docker-compose.yml`
