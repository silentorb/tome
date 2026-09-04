# tome-test-support — agent notes

## What it is

Shared **test infrastructure** (not a product package): tier helpers, JUnit classification, and weighted-gate math for root `bun run test`.

## When to use

- Prefer plain `test(...)` for essential coverage (default tier).
- Use `nonessentialTest(...)` when a case still has value but stays brittle (see [`docs/features/testing.md`](../../docs/features/testing.md)).
- Do not invent alternate prefixes or skip-based “tiers”.

## Run / test

```bash
bun test   # from this package
```

## See also

- [testing.md](../../docs/features/testing.md)
- Root [`AGENTS.md`](../../AGENTS.md) § Robust UI testing
