# tome-graph-interfaces

Domain DTOs and the `TomeGraphServices` contract for Tome’s property graph. Types only — no HTTP routes or fetch clients.

`tome-db` implements and builds these shapes; hosts (e.g. the editor API) depend on this package for the graph services surface without importing storage internals.

Agent notes: [`AGENTS.md`](./AGENTS.md).
