import { describe, expect, test } from "bun:test";
import { documentsEqual } from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import {
  documentToStorageBody,
  parseStorageBody,
  storageBodyToDocument,
} from "../src/node-body-document";

const A = "0000000000000000000000000A";
const B = "0000000000000000000000000B";

function cacheWithTitles(): { db: GraphDatabase; cache: TomeQueryCache } {
  const db = new GraphDatabase(":memory:", { clean: true });
  const cache = wrapSyncGraphDatabase(db);
  db.upsertNode(A, { title: "Alpha" });
  db.upsertNode(B, { title: "Beta" });
  return { db, cache };
}

async function roundTrip(cache: TomeQueryCache, storage: string) {
  const doc = await storageBodyToDocument(cache, storage);
  const again = await storageBodyToDocument(cache, documentToStorageBody(doc));
  expect(documentsEqual(again, doc)).toBe(true);
  return doc;
}

describe("node body document", () => {
  test("round-trips dynamic and static links", async () => {
    const { db, cache } = cacheWithTitles();
    const storage = `Hello [[${A}]] and [Custom](./${B}.md).\n`;
    const doc = await roundTrip(cache, storage);
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

  test("round-trips page blocks and callouts", async () => {
    const { db, cache } = cacheWithTitles();
    const fence = ['```json {type="demo"}', JSON.stringify({ x: 1 }, null, 2), "```"].join("\n");
    const storage = `Before\n\n${fence}\n\n> 💡 A note\n`;
    const doc = await roundTrip(cache, storage);
    expect(doc.content.map((block) => block.type)).toEqual(["paragraph", "page_block", "callout"]);
    const block = doc.content[1];
    expect(block?.type).toBe("page_block");
    if (block?.type === "page_block") {
      expect(block.blockType).toBe("demo");
      expect(block.data).toEqual({ x: 1 });
      expect(block.editorHtml).toBeUndefined();
    }
    const callout = doc.content[2];
    expect(callout?.type).toBe("callout");
    if (callout?.type === "callout") {
      expect(callout.emoji).toBe("💡");
    }
    const stored = documentToStorageBody(doc);
    expect(stored).toContain("```json {type=\"demo\"}");
    expect(stored).toContain('"x": 1');
    expect(stored).toContain("💡");
    db.close();
  });

  test("round-trips task blocks from checkbox-lead blockquotes", () => {
    const unchecked = parseStorageBody("> [ ] Buy milk\n");
    expect(unchecked.content.map((block) => block.type)).toEqual(["task"]);
    const task = unchecked.content[0];
    expect(task?.type).toBe("task");
    if (task?.type === "task") {
      expect(task.checked).toBe(false);
      expect(task.content[0]).toEqual({
        type: "paragraph",
        content: [{ type: "text", text: "Buy milk" }],
      });
    }
    expect(documentToStorageBody(unchecked)).toContain("> [ ] Buy milk");

    const checked = parseStorageBody("> [x] Done\n");
    expect(checked.content[0]).toMatchObject({ type: "task", checked: true });
    expect(documentToStorageBody(checked)).toContain("> [x] Done");

    // Task marker wins over callout emoji when both could apply (marker is first).
    const plain = parseStorageBody("> Plain quote\n");
    expect(plain.content[0]?.type).toBe("blockquote");
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
