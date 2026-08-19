import { collectionTransformsLibrary } from "imp-collection-transforms";
import { pathingLibrary } from "imp-pathing";
import { createRegistry, loadLibrary } from "imp-registry";
import { coreNodeLibrary } from "imp-spec";
import { tomeCorpusLibrary } from "./corpus";

/** Registry with core + collection transforms + pathing + Tome corpus for Tome Imp hosts. */
export function createTomeImpRegistry() {
  return loadLibrary(
    loadLibrary(
      loadLibrary(
        loadLibrary(createRegistry(), coreNodeLibrary),
        collectionTransformsLibrary,
      ),
      pathingLibrary,
    ),
    tomeCorpusLibrary,
  );
}
