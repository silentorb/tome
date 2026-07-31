# tome-imp-sql

Tome binder for Imp → SQL: live `nodes` schema, `relationship_projections` edges for path ops, and registry helpers. Compile-only — no mutations or sync (those stay in `tome-db`).

```ts
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
  projectionType,
  tomeLiveNodesSchema,
} from "tome-imp-sql"
```

See [`docs/features/tome-imp-sql.md`](../../docs/features/tome-imp-sql.md).
