# tome-functional-tests — agent notes

## What it is

Dev-only package for **heavier cross-package scenarios**. Production packages must not depend on it.

## Coupling rules

- Depend on public package entrypoints + `tome-db/content/test-helpers`.
- Do **not** import from another package’s `tests/` tree — keep harness helpers local under `src/harness/`.
- Do not add reverse dependencies into `tome-query`, `tome-editor`, `tome-server`, etc.

## Layout

| Path | Role |
| --- | --- |
| `src/harness/create-test-api.ts` | Temp fixture → in-process API handler |
| `src/harness/handler-client.ts` | `saveBody` / `prepareEditorBody` via `handler(Request)` |
| `tests/` | Functional scenarios |

## Follow-ups

If a round-trip test passes but the live editor still loses block UI state on refresh, investigate `page-block-embed` `onBlockDataChange` → Milkdown `markdownUpdated` (NodeView hop not covered here).
