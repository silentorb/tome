# tome-functional-tests

Cross-package **functional** tests for Tome — virtualized client↔API round trips that span packages without coupling those packages to each other in production.

Not a runtime library. No production consumers.

## Scope

- In-process HTTP (`createApiHandler`) + temp content fixtures (`tome-db` test helpers)
- Real editor normalize / page-block collapse helpers
- Extension UI mounts (happy-dom) where useful

**Not in v1:** full Crepe autosave debounce, Playwright, or a real TCP listen port.

Host hop covered elsewhere: `tome-editor` `page-block-embed.test.ts` asserts `setNodeMarkup` → `getMarkdown` keeps block data (e.g. query graph edits).

## Run

```bash
bun run --filter tome-functional-tests test
# or from repo root:
bun run test:functional
```

No package-local `tsc` gate (same as `tome-server` API tests); Bun runs the suites directly.
