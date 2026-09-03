# tome-test-support

Dev-only helpers for Tome’s weighted test tiers:

- `criticalTest` / `nonessentialTest` — mark bun:test cases for weighted gating
- JUnit XML parsing and gate evaluation used by `scripts/run-weighted-tests.ts`

**Nonessential** means lower weight in the gate (tests still always run). It is not a skip or config toggle.

See [`docs/features/testing.md`](../../docs/features/testing.md).
