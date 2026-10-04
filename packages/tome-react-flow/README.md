# tome-react-flow

General Imp operator graph editor built on [React Flow](https://reactflow.dev/) (`@xyflow/react`).

Topology round-trip with Imp graphs is provided by [`imp-react-flow`](../../../imp-ts/packages/imp-react-flow/). This package adds the canvas UI: palette, custom operator nodes, connect/replace inbound edges, and optional traverse hop controls.

Consumers inject an Imp `Registry` via `createRegistry` (e.g. `createTomeImpRegistry` from `tome-imp-sql`).
