# tome-ontology-ui

Client-side ontology viewing/editing. First surface: interactive **`imp_graph` property sections** (Imp node→boolean graphs on predicate nodes).

## Boundaries

- Depends on `tome-ontology` + `tome-react-flow` (+ Imp packages).
- Never inverted: `tome-ontology` must not import this package.
- Registers via the page-block editor host with `propertyColumnTypes: ["imp_graph"]` so the node page can mount the Imp editor on structured property sections (not in-body page-block fences).

## Storage

Predicate selection graphs live on the node property key `predicate` (table-schema `type: "imp_graph"`, `storage: "node"`). React Flow is editor-only via `impToReactFlow` / `reactFlowToImp`.
