# tome-extension-fixture

Minimal **reference extension** for the Tome extension system. It is not used in production content; it exists so tests and authors can see a working example of the three page-block subsystem entry points (editor, html, server).

Each entry depends only on `tome-interfaces` and exports a `register(host)` function. Enable it by adding rows to a project’s `content/model/extensions.json` that point at `tome-extension-fixture/editor`, `/html`, and `/server`.

For contracts and registration, see [`docs/features/extensions.md`](../../docs/features/extensions.md) and [`docs/extensions/page-blocks.md`](../../docs/extensions/page-blocks.md).
