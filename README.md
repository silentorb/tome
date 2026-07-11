# Tome

Domain-agnostic tooling for git-tracked design graphs: SQLite query cache (`tome-db`), config-driven server host (`tome-server` + `tome-http`), web editor (`tome-editor`), and static site export (`tome-static-site`).

## Packages

| Package | Role |
| ------- | ---- |
| `packages/tome-db/` | Property graph storage, content sync, schema loaders |
| `packages/tome-graph-interfaces/` | Domain DTOs + `TomeGraphServices` |
| `packages/tome-service-interfaces/` | `TomeServiceModule` contracts |
| `packages/tome-http/` | HTTP service module + client SDK |
| `packages/tome-server/` | Config-driven host (wires db + services) |
| `packages/tome-editor/` | Vite/React markdown editor (client only) |
| `packages/tome-static-site/` | Astro static site generator |

See [`packages/README.md`](./packages/README.md) for the full package list.

```mermaid
flowchart TB
  subgraph contracts [Contracts]
    GI[tome-graph-interfaces]
    SI[tome-service-interfaces]
    EI[tome-interfaces]
    SI --> GI
  end

  subgraph storage [Storage]
    SF[tome-flatfile]
    CS[tome-sqlite]
  end

  SF --> SI
  CS --> SI

  DB[tome-db]
  DB --> SF
  DB --> CS
  DB --> GI
  DB --> EI

  subgraph host [Host]
    SRV[tome-server]
    HTTP[tome-http]
  end

  SRV --> DB
  SRV -.->|loads via config| HTTP
  HTTP --> SI
  HTTP --> GI

  subgraph surfaces [Surfaces]
    ED[tome-editor]
    SS[tome-static-site]
  end

  ED -->|HTTP client| HTTP
  ED --> GI
  ED --> EI
  SS --> DB
  SS --> EI

  subgraph plugins [Themes and extensions]
    TH[tome-theme-midnight]
    EXT[tome-extension-*]
    SP[tome-spatial-graph]
    SD[tome-schema-diagram]
  end

  EXT --> EI
  SP --> EI
  SD --> EI
  ED --> TH
  SS --> TH
  SS --> EXT
  SS --> SP
  SS --> SD
```

## Development

This repo is typically opened via **silentorb-workbench**, which bind-mounts `tome` and a domain repo (e.g. marloth-story) and runs the editor in a Compose `tome` service with `TOME_CONTENT_PATH` pointing at the domain `content/` directory.

Standalone (with `TOME_CONTENT_PATH` set):

```bash
bun install --frozen-lockfile
bun run editor:dev
```

See [`AGENTS.md`](./AGENTS.md) and [`docs/features/`](./docs/features/) for feature specs.
