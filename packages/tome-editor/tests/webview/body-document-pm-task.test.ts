import { describe, expect, test } from "bun:test";
import { emptyNodeBodyDocument, type NodeBodyDocument } from "tome-graph-interfaces";
import { documentToPmJson, pmJsonToDocument } from "../../src/webview/body-document-pm";

describe("body-document-pm tasks", () => {
  test("keeps checked in attrs and marker out of body text", () => {
    const doc: NodeBodyDocument = {
      ...emptyNodeBodyDocument(),
      content: [
        {
          type: "task",
          checked: false,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Buy milk" }] }],
        },
      ],
    };

    const pm = documentToPmJson(doc);
    const task = pm.content?.[0];
    expect(task?.type).toBe("task");
    expect(task?.attrs?.checked).toBe(false);
    expect(task?.content?.[0]?.content?.[0]?.text).toBe("Buy milk");

    const roundTrip = pmJsonToDocument(pm);
    expect(roundTrip.content[0]).toEqual(doc.content[0]);
  });

  test("promotes checkbox-lead blockquotes to task when reading PM", () => {
    const pm = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "[x] Done already" }],
            },
          ],
        },
      ],
    };

    const doc = pmJsonToDocument(pm);
    expect(doc.content[0]).toEqual({
      type: "task",
      checked: true,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Done already" }] }],
    });
  });

  test("strips leftover lead marker from task body when reading PM", () => {
    const pm = {
      type: "doc",
      content: [
        {
          type: "task",
          attrs: { checked: true },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "[x] leftover prefix" }],
            },
          ],
        },
      ],
    };

    const doc = pmJsonToDocument(pm);
    expect(doc.content[0]).toEqual({
      type: "task",
      checked: true,
      content: [{ type: "paragraph", content: [{ type: "text", text: "leftover prefix" }] }],
    });
  });
});
