import { describe, expect, test } from "bun:test";
import {
  PAGE_NODE_ID_LITERAL,
  bindPageNodeId,
  defaultBlockData,
  parseSequencingBlockData,
} from "../src/config";

describe("sequencing block config", () => {
  test("default includes page node sentinel", () => {
    const data = defaultBlockData();
    const lit = data.reactFlow.nodes.find((n) => n.id === "lit");
    expect(lit?.data?.inputValues?.value).toBe(PAGE_NODE_ID_LITERAL);
  });

  test("bindPageNodeId replaces sentinel", () => {
    const data = defaultBlockData();
    const bound = bindPageNodeId(data.reactFlow, "01KWN86X6MFZQAJ1V36T9592A9");
    const lit = bound.nodes.find((n) => n.id === "lit");
    expect(lit?.data?.inputValues?.value).toBe("01KWN86X6MFZQAJ1V36T9592A9");
  });

  test("parse falls back to default", () => {
    const parsed = parseSequencingBlockData(null);
    expect(parsed.reactFlow.nodes.length).toBeGreaterThan(0);
  });
});
