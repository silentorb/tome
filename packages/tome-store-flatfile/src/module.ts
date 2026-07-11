import type { TomeDataStoreOpenOptions, TomeStoreModule } from "tome-service-interfaces";
import { resolveContentPath } from "./content/paths";
import { ContentStore } from "./content/store";

const MODULE_ID = "tome-store-flatfile";

/** Factory for the flatfile store module loaded by `tome-server`. */
export function createFlatfileStoreModule(): TomeStoreModule {
  return {
    id: MODULE_ID,
    open(options?: TomeDataStoreOpenOptions) {
      const contentPath = options?.contentPath ?? resolveContentPath();
      return new ContentStore(contentPath);
    },
  };
}
