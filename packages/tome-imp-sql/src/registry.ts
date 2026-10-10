import { collectionTransformsLibrary } from "imp-collection-transforms";
import { pathingLibrary } from "imp-pathing";
import { createRegistry, loadLibrary } from "imp-registry";
import { coreNodeLibrary } from "imp-core-types";
import { tomeCorpusLibrary } from "./corpus";
import { tomeHostsProjectionLibrary } from "./hosts-projection";

/**
 * Registry with core + collection transforms + pathing + Tome corpus +
 * hosts_projection (node-filter editor catalog) for Tome Imp hosts.
 */
export function createTomeImpRegistry() {
  return loadLibrary(
    loadLibrary(
      loadLibrary(
        loadLibrary(
          loadLibrary(createRegistry(), coreNodeLibrary),
          collectionTransformsLibrary,
        ),
        pathingLibrary,
      ),
      tomeCorpusLibrary,
    ),
    tomeHostsProjectionLibrary,
  );
}
