# tome-service-interfaces

Contracts for modules hosted by `tome-server`:

- **Services** (`TomeServiceModule`) — zero-or-more protocol adapters (e.g. HTTP)
- **Store / cache** (`TomeStoreModule`, `TomeCacheModule`, `TomeDataStore`, `TomeQueryCache`) — singular infrastructure slots

Does not define HTTP routes or clients — those live in `tome-http`.
