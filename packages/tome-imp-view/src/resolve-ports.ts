import type { ResolvePorts } from "imp-graph-view";
import { getNodeDefinition, listNodeDefinitions, type Registry } from "imp-registry";

export type CreateRegistry = () => Registry;

/** Map an Imp registry factory to ImpGraphView.resolvePorts. */
export function resolvePortsFromRegistry(createRegistry: CreateRegistry): ResolvePorts {
  return (nodeType, _nodeId, _edges) => {
    const definition = getNodeDefinition(createRegistry(), nodeType);
    if (!definition) {
      return { inputs: [], outputs: [] };
    }
    return {
      inputs: Object.values(definition.inputs).map((port) => ({
        id: port.id,
        variadic: port.variadic,
        type: port.type,
        defaultValue: port.defaultValue,
      })),
      outputs: Object.values(definition.outputs).map((port) => ({
        id: port.id,
      })),
    };
  };
}

/** Palette entries: all registry node types except graph boundaries. */
export function listPaletteNodeTypes(createRegistry: CreateRegistry) {
  return listNodeDefinitions(createRegistry()).filter(
    (type) => type.id !== "input" && type.id !== "output",
  );
}
