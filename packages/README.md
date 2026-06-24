# Tome packages

Each subdirectory is a **workspace package** in the Tome monorepo. Packages are domain-agnostic unless their name indicates otherwise (e.g. `tome-extension-*`).

| Package | Role |
| --- | --- |
| [`tome-db`](./tome-db/) | Graph storage, SQLite cache, content sync |
| [`tome-editor`](./tome-editor/) | Browser editor (API + webview) |
| [`tome-static-site`](./tome-static-site/) | Static HTML export |
| [`tome-theme-midnight`](./tome-theme-midnight/) | Midnight theme tokens and shared cross-surface CSS |
| [`tome-interfaces`](./tome-interfaces/) | Integration contracts for external modules |
| [`tome-extension-fixture`](./tome-extension-fixture/) | Reference/test extension (not production) |
| [`tome-spatial-graph`](./tome-spatial-graph/) | Compound spatial graph page block (cytoscape SVG) |

## Package documentation

Every package includes:

- **`README.md`** — brief context: what the package is and why it exists (no runbooks).
- **`AGENTS.md`** — how to work in the package (commands, layout, conventions).

When adding a new package, add both files before landing substantial code.
