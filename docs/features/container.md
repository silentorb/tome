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
3. `scripts/dev-start.sh` → `scripts/ensure-node-modules.sh` → `docker/ensure-deps-dev.sh` → `bun install --frozen-lockfile` → symlink `imp-ts/node_modules` to tome’s tree and drop dangling per-package Imp `node_modules` links (sibling installs such as `tome-neo4j` can point into an unmounted `.bun` store) → `editor:dev`.
4. Ports **5173** (Vite) and **3847** (API).

### Release (GHCR)

1. `docker/build-release.sh` feeds three BuildKit named contexts: `tome`, `imp` (imp-ts) and `imp-graph-view`. Each source is a **local folder or a git URL**:
   - **Locally**, the defaults are the sibling working trees (`../imp-ts`, `../imp-graph-view`).
   - **In CI**, they're `https://github.com/silentorb/<repo>.git#<ref>` at `vars.IMP_TS_REF` / `vars.IMP_GRAPH_VIEW_REF` (default `main`), with no checkout steps.

   Same script, same Dockerfile; only the dependency origins differ.
2. `Dockerfile.release` normalizes the sources (drops `node_modules` and `.git`), so a folder and a git URL produce the same tree. It then installs from the dependency manifests alone (`package.json` files, `bun.lock`, `bunfig.toml`) before copying the rest of the source. A source-only change reuses the cached install layer.
3. `bake-deps.sh` runs `bun install --frozen-lockfile` and writes `.baked-lock-hash`.
4. Image layout:
   - `/opt/tome` — working tree (source + `node_modules`)
   - `/opt/tome-baked` — immutable seed (same tree; used if a bind mount hides `node_modules`)
   - `/opt/imp-ts`, `/opt/imp-graph-view` — baked sibling sources
5. `docker/validate-release.sh` runs `ensure-deps`, then the full `test` suite, with `--network none`. CI pushes the **validated** image (a retag, not a rebuild).
6. Entrypoint validates lockfile hash; on drift, **fails** with rebuild instructions (never fetches).
7. Publish `ghcr.io/silentorb/tome` **only** for git tags matching `v*` (semver + `major.minor`). Pushes to `main` do not publish an image.
8. Published tags are a **plain single-arch** image (`linux/amd64`), not an OCI index. Multi-arch indexes stay deferred until real extra platforms are published.

### Consuming the image for corpus sites

Corpus sites (marloth-story, silentorb-web) build in the release image instead of from tome's source:
- The site's `Dockerfile` is `FROM ghcr.io/silentorb/tome:<x.y>`. That line is the site's tome pin, and Dependabot / Renovate can bump it.
- The site's build script runs `web:build --repo /site` offline with the site's `content/` (and `public/`) mounted.
- Locally, the script swaps the base for a locally built image with `--build-context ghcr.io/silentorb/tome:<x.y>=docker-image://ghcr.io/silentorb/tome:local`.
- In CI, the site calls the reusable [`.github/workflows/deploy-static-site.yml`](../../.github/workflows/deploy-static-site.yml), pinned to a tome tag.

A site's content format must match its pinned image: a bump to a newer image may need a content migration in the same change.

### Semver image tags ↔ root version

GHCR semver tags come from **git tags** matching `v*` (e.g. `v0.1.0`), not from workspace package versions under `packages/*`.

- The **repo-root** `package.json` `"version"` is the release / container version.
- Agents create a **local** annotated tag `v<version>` after a dedicated bump commit when the user says **bump** or **commit and bump** (`bash scripts/git-tag-version.sh tome` from silentorb-workbench). Plain **commit** does **not** bump versions or create tags.
- **Push is manual** — push the annotated `v*` tag (and its commit) when you want CI to publish. Agents do not push. Ordinary pushes to `main` do not build or publish GHCR images.

## Inputs / outputs / artifacts

| Artifact | Role |
| --- | --- |
| `ghcr.io/silentorb/tome:<tag>` | Release image for consumers |
| `.baked-lock-hash` | Lockfile fingerprint inside the release image |
| `docker/build-release.sh` | Release build, local and CI (folder or git URL sources) |
| `docker/validate-release.sh` | Offline validate, local and CI |
| `.github/workflows/deploy-static-site.yml` | Reusable site deploy (`workflow_call`) for corpus sites |

## Quick start

**Dev image (local):**

```bash
docker build -f docker/Dockerfile.dev -t tome-dev:local .
```

**Release image (local; sibling imp-ts and imp-graph-view by default):**

```bash
bash docker/build-release.sh
# other sources, as folders or git URLs:
# IMP_TS_SOURCE=https://github.com/silentorb/imp-ts.git#main bash docker/build-release.sh
bash docker/validate-release.sh   # offline ensure-deps + full test suite; run on its own
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
| `TOME_PROFILING` | Opt-in API/SQL profiling (`1` / `verbose`); default off — see [tome-server.md](./tome-server.md) § Request / SQL profiling |
| `TOME_PROFILING_SLOW_MS` | Slow-sample threshold in ms when profiling (default 100) |
| `TOME_PROFILING_DB_PATH` | Profiling SQLite path (default: `tome-profiling.sqlite` beside the cache DB) |
| `TOME_PROFILING_LOG` | Mirror spans to stderr (`1`); default off |
| `TOME_PROFILING_MAX_MB` | Soft retention ceiling in MB (default 32; used-page metering, prune-before-insert) |
| `TOME_PROFILING_BATCH_DELETE_MB` | Batch delete size in MB when near the ceiling (default 4) |
| `IMP_ROOT` | Imp sibling path (default `/opt/imp-ts` in release). For `build-release.sh`, a legacy alias of `IMP_TS_SOURCE` |
| `TOME_BAKED_ROOT` | Immutable bake path (default `/opt/tome-baked`) |
| `TOME_SOURCE`, `IMP_TS_SOURCE`, `IMP_GRAPH_VIEW_SOURCE` | `build-release.sh` sources: a folder or a git URL (defaults: this checkout and the siblings) |
| `IMAGE_TAG` | `build-release.sh` / `validate-release.sh` image (default `ghcr.io/silentorb/tome:local`) |
| `IMP_TS_REF`, `IMP_GRAPH_VIEW_REF` (CI vars) | Git refs of the imp sources when CI builds the release image (default `main`). `IMP_REF` is the legacy name of `IMP_TS_REF` |

Enable profiling on a running container without rebuilding, e.g. `docker run -e TOME_PROFILING=1 …` or in the workbench: `TOME_PROFILING=1` when starting Compose (the `tome` service forwards the vars). Inspect via `GET /api/debug/profiling` and `POST /api/debug/profiling/execute-imp` on the API port while profiling is on (optional stderr with `TOME_PROFILING_LOG=1`).
## Verification

- Release CI: `.github/workflows/container.yml` runs on `v*` tags (and `workflow_dispatch` of a `v*` ref). It calls `build-release.sh` (git URL imp sources), then `validate-release.sh` (`ensure-deps` + `test` with `--network none`), then retags and pushes the validated image to the semver tags.
- Locally: `bash docker/build-release.sh && bash docker/validate-release.sh`, the same two steps with sibling sources. From silentorb-workbench, `scripts/ci-local.sh tome`.
- Offline `test` runs root `bun run test` → **weighted** essential/nonessential gating (see [`testing.md`](./testing.md)).
- Dev: open workbench / rebuild Compose `tome` service after `docker/` toolchain changes.
- Lockfile drift on release: change `bun.lock` / `package.json` under the working tree → `ensure-deps` must exit non-zero.

## Implementation pointers

| Path | Role |
| --- | --- |
| [`docker/install-runtime.sh`](../../docker/install-runtime.sh) | apt + Bun pin (base + dev + release base stage); includes `git` for git-watch sync |
| [`docker/bake-deps.sh`](../../docker/bake-deps.sh) | Release-only dependency bake |
| [`docker/ensure-deps-dev.sh`](../../docker/ensure-deps-dev.sh) | Runtime install for workbench |
| [`docker/ensure-deps-release.sh`](../../docker/ensure-deps-release.sh) | Offline seed / lockfile check |
| [`docker/entrypoint-release.sh`](../../docker/entrypoint-release.sh) | Release CMD dispatch |
| [`docker/build-release.sh`](../../docker/build-release.sh) | Release build (local and CI) with named contexts from folders or git URLs |
| [`docker/validate-release.sh`](../../docker/validate-release.sh) | Offline validate (local and CI) |
| [`.github/workflows/deploy-static-site.yml`](../../.github/workflows/deploy-static-site.yml) | Reusable corpus-site deploy |
| [`scripts/ensure-node-modules.sh`](../../scripts/ensure-node-modules.sh) | Stable caller; sources ensure-deps-dev in git tree |

## See also

- [tome-editor.md](./tome-editor.md) — editor webview + API ports
- [tome-server.md](./tome-server.md) — API host
- [multi-corpus.md](./multi-corpus.md) — `TOME_CORPORA`
- Workbench Compose: `silentorb-workbench/.devcontainer/docker-compose.yml`
