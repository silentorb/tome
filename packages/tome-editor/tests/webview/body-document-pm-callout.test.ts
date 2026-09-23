import { describe, expect, test } from "bun:test";
import { emptyNodeBodyDocument, type NodeBodyDocument } from "tome-graph-interfaces";
import { documentToPmJson, pmJsonToDocument } from "../../src/webview/body-document-pm";

describe("body-document-pm callouts", () => {
  test("keeps emoji in attrs and out of body text", () => {
    const doc: NodeBodyDocument = {
      ...emptyNodeBodyDocument(),
      content: [
        {
          type: "callout",
          emoji: "⚠️",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Be careful" }] }],
        },
      ],
    };

    const pm = documentToPmJson(doc);
    const callout = pm.content?.[0];
    expect(callout?.type).toBe("callout");
    expect(callout?.attrs?.emoji).toBe("⚠️");
    const firstPara = callout?.content?.[0];
    expect(firstPara?.type).toBe("paragraph");
    expect(firstPara?.content?.[0]?.text).toBe("Be careful");

    const roundTrip = pmJsonToDocument(pm);
    expect(roundTrip.content[0]).toEqual(doc.content[0]);
  });

  test("strips leftover lead emoji from callout body when reading PM", () => {
    const pm = {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { emoji: "💡" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "💡 leftover prefix" }],
            },
          ],
        },
      ],
    };

    const doc = pmJsonToDocument(pm);
    expect(doc.content[0]).toEqual({
      type: "callout",
      emoji: "💡",
      content: [{ type: "paragraph", content: [{ type: "text", text: "leftover prefix" }] }],
    });
  });
});
