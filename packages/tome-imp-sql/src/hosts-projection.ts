/**
 * Tome-only Imp node-filter operator for the shared editor registry.
 * Evaluated by tome-ontology / tome-db shape parsers — not lowered by imp-sql.
 */

import type { NodeLibrary, Port, SignalType } from "imp-core-types";
import { HOSTS_PROJECTION_NODE_TYPE } from "tome-ontology";

const string: SignalType = { id: "string" };
const number: SignalType = { id: "number" };
const boolean: SignalType = { id: "boolean" };

function port(id: string, type: SignalType): Port {
  return { id, type };
}

export const tomeHostsProjectionLibrary: NodeLibrary = {
  id: "tome.hosts-projection",
  definitions: [
    {
      id: HOSTS_PROJECTION_NODE_TYPE,
      inputs: {
        association: port("association", string),
        direction: port("direction", number),
      },
      outputs: {
        value: port("value", boolean),
      },
    },
  ],
};
