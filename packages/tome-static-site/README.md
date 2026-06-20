# tome-static-site

**Static HTML export** for a Tome content corpus. Generates one read-only page per node (metadata, markdown body, table sections, cross-links) via a Bun data phase and an Astro build, output under `dist/web/` by default.

Consumes `tome-db` for graph assembly and may render extension page blocks through the html subsystem contracts in `tome-interfaces`.

Feature spec: [`docs/features/static-website.md`](../../docs/features/static-website.md). Agent notes: [`AGENTS.md`](./AGENTS.md).
