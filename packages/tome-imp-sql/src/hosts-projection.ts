/**
 * Tome-only Imp node-filter operator for the shared editor registry.
 * Evaluated by tome-ontology / tome-db shape parsers — not lowered by imp-sql.
 */

import type { NodeLibrary, Port, Type } from "imp-core-types";
import { HOSTS_PROJECTION_NODE_TYPE } from "tome-ontology";

const string: Type = { id: "string" };
const number: Type = { id: "number" };
const boolean: Type = { id: "boolean" };

function port(id: string, type: Type): Port {
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
