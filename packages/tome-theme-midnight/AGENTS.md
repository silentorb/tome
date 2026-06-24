# tome-theme-midnight — agent notes

## What it is

CSS-only workspace package for the **Midnight** theme. Owns `:root` tokens and shared `.tome-*` component rules that must match between the browser editor and static site export.

## Exports

| Subpath | File | Contents |
| --- | --- | --- |
| `.` | `src/index.css` | Full theme (`@import` chain) |
| `./tokens` | `src/tokens.css` | `:root` `--tome-*` variables |
| `./content-panel` | `src/content-panel.css` | `.tome-content-panel`, `.tome-database-table-wrap` |
| `./node-page` | `src/node-page.css` | Node page sections, metadata, properties |
| `./database-table` | `src/database-table.css` | Read-only table chrome baseline |
| `./callouts` | `src/callouts.css` | `blockquote.tome-callout` rules |

Consumers import subpaths when they need surface-specific overrides on top of shared rules.

## What belongs here vs consumers

| Here | In `tome-editor` / `tome-static-site` |
| --- | --- |
| Token definitions | App shell (`#root`, `.tome-layout`, site header/footer) |
| Shared node-page layout | Editor Milkdown/ProseMirror overrides |
| Shared table chrome | Interactive table rules (sticky headers, DnD, max-width caps) |
| Callout base styles | Milkdown `!important` overrides; `.prose` typography scale |

## Adding another theme

Copy this package as `tome-theme-<name>`, adjust `tokens.css`, and swap the import in consumers (or add a build-time theme selector later). Do not fold multiple themes into one package until a second theme is actively maintained.

## Tests

```bash
bun test packages/tome-theme-midnight/tests
```
