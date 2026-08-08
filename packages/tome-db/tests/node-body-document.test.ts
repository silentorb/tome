import { describe, expect, test } from "bun:test";
import { GraphDatabase } from "tome-sqlite";
import {
  documentToStorageBody,
  storageBodyToDocument,
} from "../src/node-body-document";

const A = "0000000000000000000000000A";
const B = "0000000000000000000000000B";

function dbWithTitles(): GraphDatabase {
  const db = new GraphDatabase(":memory:", { clean: true });
  db.upsertNode(A, { title: "Alpha" });
  db.upsertNode(B, { title: "Beta" });
  return db;
}

describe("node body document", () => {
  test("round-trips dynamic and static links", () => {
    const db = dbWithTitles();
    const storage = `Hello [[${A}]] and [Custom](./${B}.md).\n`;
    const doc = storageBodyToDocument(db, storage);
    expect(doc.segments).toEqual([
      { type: "prose", markdown: "Hello " },
      { type: "dynamic_link", nodeId: A, title: "Alpha" },
      { type: "prose", markdown: " and " },
      { type: "static_link", nodeId: B, label: "Custom" },
      { type: "prose", markdown: ".\n" },
    ]);
    expect(documentToStorageBody(doc)).toBe(storage);
    db.close();
  });

  test("round-trips page blocks", () => {
    const db = dbWithTitles();
    const fence = ["```tome-block", JSON.stringify({ componentId: "demo.block", data: { x: 1 } }, null, 2), "```"].join(
      "\n",
    );
    const storage = `Before\n\n${fence}\n\nAfter`;
    const doc = storageBodyToDocument(db, storage);
    expect(doc.segments.map((s) => s.type)).toEqual([
      "prose",
      "page_block",
      "prose",
    ]);
    const block = doc.segments[1];
    expect(block?.type).toBe("page_block");
    if (block?.type === "page_block") {
      expect(block.componentId).toBe("demo.block");
      expect(block.data).toEqual({ x: 1 });
      expect(block.editorHtml).toBe("");
    }
    expect(documentToStorageBody(doc)).toBe(storage);
    db.close();
  });
});
