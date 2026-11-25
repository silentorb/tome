import { describe, expect, test } from "bun:test";
import { isConcreteType, type Type } from "imp-core-types";
import { getNodeDefinition } from "imp-registry";
import { HOSTS_PROJECTION_NODE_TYPE } from "tome-ontology";
import { createTomeImpRegistry, tomeHostsProjectionLibrary } from "../src/index";

function typeId(type: Type): string {
  expect(isConcreteType(type)).toBe(true);
  if (!isConcreteType(type)) throw new Error("expected concrete type");
  return type.id;
}

describe("tome-imp-sql hosts_projection catalog", () => {
  test("library defines association, direction inputs and boolean value output", () => {
    const def = tomeHostsProjectionLibrary.definitions[0];
    expect(def?.id).toBe(HOSTS_PROJECTION_NODE_TYPE);
    expect(Object.keys(def?.inputs ?? {}).sort()).toEqual(["association", "direction"]);
    expect(typeId(def!.inputs.association!.type)).toBe("string");
    expect(typeId(def!.inputs.direction!.type)).toBe("number");
    expect(typeId(def!.outputs.value!.type)).toBe("boolean");
  });

  test("createTomeImpRegistry exposes hosts_projection for Imp graph view", () => {
    const registry = createTomeImpRegistry();
    const def = getNodeDefinition(registry, HOSTS_PROJECTION_NODE_TYPE);
    expect(def).toBeDefined();
    expect(Object.keys(def!.inputs).sort()).toEqual(["association", "direction"]);
    expect(Object.keys(def!.outputs)).toEqual(["value"]);
  });
});
