# tome-editor

**Browser editor** for design-corpus nodes: a Bun REST API plus a Vite/React webview with Milkdown markdown editing, graph-backed table sections, and extension hosting for custom page blocks.

Pairs with `tome-db` for reads and writes against `content/`. Domain-agnostic; workspace identity and navigation come from each project’s `content/model/workspace.json`.

Feature spec: [`docs/features/tome-editor.md`](../../docs/features/tome-editor.md). Agent notes: [`AGENTS.md`](./AGENTS.md).
