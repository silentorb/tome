# tome-ontology-ui

Client-side ontology viewing and editing for Tome.

Today this package provides the interactive **node-filter** page block (`roles: ["node-filter"]`) used on predicate nodes. The fence body stays raw Imp graph JSON; the React Flow canvas comes from [`tome-react-flow`](../tome-react-flow/).

Runtime compilation of predicates/patterns stays in [`tome-ontology`](../tome-ontology/) — this package depends on it but hosts never require either package for a minimal Tome boot.
