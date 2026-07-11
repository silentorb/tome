# tome-flatfile

Flatfile **data store** for `tome-server`: git-tracked markdown nodes and model JSON under `content/`.

Implements `TomeStoreModule` / `TomeDataStore` from `tome-service-interfaces`. Owns file I/O and filesystem change notifications (`StoreChangeEvent`); does not sync a query cache.
