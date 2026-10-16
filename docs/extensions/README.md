# Integration domains

Index of **integration domains** defined in [`tome-interfaces`](../../packages/tome-interfaces/). Each domain may expose separate contracts per consumer subsystem (editor, html, server, …).

| Domain | Doc | Status |
| --- | --- | --- |
| Page blocks (in-body custom blocks) | [page-blocks.md](./page-blocks.md) | v1 |
| Searchers (node search backends) | [searchers.md](./searchers.md) | v1 |
| Authentication providers (SSO / IdP) | [authentication-providers.md](./authentication-providers.md) | v1 |

Future domains (authorization providers, shell panels, …) add subpaths under `tome-interfaces/` when scoped.

## Authoring an extension package

1. Create a package that depends only on `tome-interfaces`.
2. Export separate entry points per subsystem (`editor`, `html`, `server`).
3. Each entry exports `register(host)` for that subsystem's host interface.
4. Register the package in project [`content/model/extensions.json`](../../../marloth-story/content/model/extensions.json).

See [extensions.md](../features/extensions.md) for the registration system.
