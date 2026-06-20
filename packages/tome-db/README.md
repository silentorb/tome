# tome-db

Core **graph storage and query layer** for Tome. Reads git-tracked content under `content/data/` (node markdown) and `content/model/` (workspace JSON), maintains a SQLite cache for fast queries, and exposes APIs for page assembly, database views, relationship mutations, and content sync.

Domain-agnostic: project-specific IDs and rules live in each corpus’s `content/`, not in this package.

Feature spec: [`docs/features/tome-db.md`](../../docs/features/tome-db.md). Agent notes: [`AGENTS.md`](./AGENTS.md).
