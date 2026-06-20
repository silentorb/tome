# tome-interfaces

**Integration contracts** for modules that plug into Tome hosts—types and small shared runtime helpers (e.g. page-block fence parse). Not tied to a single feature; the extension system is the first consumer.

External packages (including extensions) should depend on this package rather than on `tome-editor`, `tome-db`, or `tome-static-site`.

Agent notes: [`AGENTS.md`](./AGENTS.md). Extension registration: [`docs/features/extensions.md`](../../docs/features/extensions.md).
