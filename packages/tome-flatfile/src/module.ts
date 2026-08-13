import type { TomeDataStoreOpenOptions, TomeStoreModule } from "tome-service-interfaces";
import { resolveContentPath } from "./content/paths";
import { ContentStore } from "./content/store";
import { CompositeStore } from "./content/composite-store";

const MODULE_ID = "tome-flatfile";

/** Factory for the flatfile store module loaded by `tome-server`. */
export function createFlatfileModule(): TomeStoreModule {
  return {
    id: MODULE_ID,
    open(options?: TomeDataStoreOpenOptions) {
      const corpora = options?.corpora;
      if (corpora && corpora.length >= 2) {
        return new CompositeStore(corpora);
      }
      if (corpora && corpora.length === 1) {
        const only = corpora[0]!;
        return new ContentStore(only.contentPath, {
          corpusId: only.id,
          access: only.access === "readonly" ? "readonly" : "readwrite",
        });
      }
      const contentPath = options?.contentPath ?? resolveContentPath();
      return new ContentStore(contentPath);
    },
  };
}
