import { describe, expect, test } from "bun:test";
import { documentToStorageBody } from "tome-db/document-to-storage-body";
import { editorDynamicNodeHref } from "tome-flatfile/dynamic-node-links";
import type { NodeBodyDocument } from "tome-graph-interfaces";
import { documentToPmJson, pmJsonToDocument } from "../../src/webview/body-document-pm";

const TARGET = "0000000000000000000000002X";

function dynamicDoc(): NodeBodyDocument {
  return {
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "dynamic_link", nodeId: TARGET, title: "Cozy horror" }],
      },
    ],
  };
}

describe("dynamic link document mapping", () => {
  test("storage form is a wiki link and ProseMirror round-trips the dynamic link", () => {
    expect(documentToStorageBody(dynamicDoc())).toContain(`[[${TARGET}]]`);
    const roundTrip = pmJsonToDocument(documentToPmJson(dynamicDoc()));
    expect(roundTrip.content).toEqual(dynamicDoc().content);
  });

  test("a link mark without dynamicTitle is a static link in storage", () => {
    const doc = pmJsonToDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Cozy horror",
              marks: [{ type: "link", attrs: { href: `?node=${TARGET}`, title: null } }],
            },
          ],
        },
      ],
    });
    expect(documentToStorageBody(doc)).toContain(`[Cozy horror](./${TARGET}.md)`);
  });

  test("dynamicTitle href format", () => {
    expect(editorDynamicNodeHref(TARGET)).toBe(`?node=${TARGET}&dynamicTitle=1`);
  });
});
