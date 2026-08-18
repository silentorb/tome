# tome-sequencing-interfaces — agent notes

## What it is

Shared **sequencing domain types** only. No algorithm, no Tome/Imp runtime.

Depends edges are `DependsConstraint` with `from` / `to` (`SequenceEndpoint`: `"start"` | `"end"`), not an FS/SS/FF/SF enum.

## Dependency rules

- **No** dependencies on other tome packages.
- Types only (plus trivial smoke tests).

## See also

- [`docs/features/tome-sequencing.md`](../../docs/features/tome-sequencing.md)
- [`docs/features/tome-sequencing-resolution.md`](../../docs/features/tome-sequencing-resolution.md)
