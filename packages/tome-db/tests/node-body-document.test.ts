import { describe, expect, test } from "bun:test";
import { documentsEqual } from "tome-graph-interfaces";
import { GraphDatabase } from "tome-sqlite";
import {
  documentToStorageBody,
  parseStorageBody,
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

function roundTrip(db: GraphDatabase, storage: string) {
  const doc = storageBodyToDocument(db, storage);
  const again = storageBodyToDocument(db, documentToStorageBody(doc));
  expect(documentsEqual(again, doc)).toBe(true);
  return doc;
}

describe("node body document", () => {
  test("round-trips dynamic and static links", () => {
    const db = dbWithTitles();
    const storage = `Hello [[${A}]] and [Custom](./${B}.md).\n`;
    const doc = roundTrip(db, storage);
    expect(doc.content).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "dynamic_link", nodeId: A, title: "Alpha" },
          { type: "text", text: " and " },
          { type: "static_link", nodeId: B, label: "Custom" },
          { type: "text", text: "." },
        ],
      },
    ]);
    expect(documentToStorageBody(doc)).toContain(`[[${A}]]`);
    expect(documentToStorageBody(doc)).toContain(`[Custom](./${B}.md)`);
    db.close();
  });

  test("round-trips page blocks and callouts", () => {
    const db = dbWithTitles();
    const fence = ["```tome-block", JSON.stringify({ componentId: "demo.block", data: { x: 1 } }, null, 2), "```"].join(
      "\n",
    );
    const storage = `Before\n\n${fence}\n\n> 💡 A note\n`;
    const doc = roundTrip(db, storage);
    expect(doc.content.map((block) => block.type)).toEqual(["paragraph", "page_block", "callout"]);
    const block = doc.content[1];
    expect(block?.type).toBe("page_block");
    if (block?.type === "page_block") {
      expect(block.componentId).toBe("demo.block");
      expect(block.data).toEqual({ x: 1 });
      expect(block.editorHtml).toBeUndefined();
    }
    const callout = doc.content[2];
    expect(callout?.type).toBe("callout");
    if (callout?.type === "callout") {
      expect(callout.emoji).toBe("💡");
    }
    const stored = documentToStorageBody(doc);
    expect(stored).toContain("```tome-block");
    expect(stored).toContain("demo.block");
    expect(stored).toContain("💡");
    db.close();
  });

  test("parses headings, lists, and emphasis", () => {
    const doc = parseStorageBody("# Title\n\n- **bold** item\n- plain\n");
    expect(doc.content.map((block) => block.type)).toEqual(["heading", "bullet_list"]);
    const list = doc.content[1];
    expect(list?.type).toBe("bullet_list");
    if (list?.type === "bullet_list") {
      expect(list.content).toHaveLength(2);
      const first = list.content[0]?.content[0];
      expect(first?.type).toBe("paragraph");
      if (first?.type === "paragraph") {
        expect(first.content[0]).toEqual({ type: "text", text: "bold", marks: ["strong"] });
      }
    }
  });
});
