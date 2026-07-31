import { collectionTransformsLibrary } from "imp-collection-transforms";
import { pathingLibrary } from "imp-pathing";
import { createRegistry, loadLibrary } from "imp-registry";
import { coreNodeLibrary } from "imp-spec";

/** Registry with core + collection transforms + pathing for Tome Imp hosts. */
export function createTomeImpRegistry() {
  return loadLibrary(
    loadLibrary(
      loadLibrary(createRegistry(), coreNodeLibrary),
      collectionTransformsLibrary,
    ),
    pathingLibrary,
  );
}
