import { describe, expect, test } from "bun:test";
import { isConcreteSignalType, type SignalType } from "imp-core-types";
import { getNodeDefinition } from "imp-registry";
import { HOSTS_PROJECTION_NODE_TYPE } from "tome-ontology";
import { createTomeImpRegistry, tomeHostsProjectionLibrary } from "../src/index";

function signalId(type: SignalType): string {
  expect(isConcreteSignalType(type)).toBe(true);
  if (!isConcreteSignalType(type)) throw new Error("expected concrete signal type");
  return type.id;
}

describe("tome-imp-sql hosts_projection catalog", () => {
  test("library defines association, direction inputs and boolean value output", () => {
    const def = tomeHostsProjectionLibrary.definitions[0];
    expect(def?.id).toBe(HOSTS_PROJECTION_NODE_TYPE);
    expect(Object.keys(def?.inputs ?? {}).sort()).toEqual(["association", "direction"]);
    expect(signalId(def!.inputs.association!.type)).toBe("string");
    expect(signalId(def!.inputs.direction!.type)).toBe("number");
    expect(signalId(def!.outputs.value!.type)).toBe("boolean");
  });

  test("createTomeImpRegistry exposes hosts_projection for ImpFlowEditor", () => {
    const registry = createTomeImpRegistry();
    const def = getNodeDefinition(registry, HOSTS_PROJECTION_NODE_TYPE);
    expect(def).toBeDefined();
    expect(Object.keys(def!.inputs).sort()).toEqual(["association", "direction"]);
    expect(Object.keys(def!.outputs)).toEqual(["value"]);
  });
});
