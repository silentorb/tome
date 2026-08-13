import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompositeStore,
  ContentStore,
  CorpusConflictError,
  CorpusReadonlyError,
  serializeAssociationsFile,
  serializeWorkspaceFile,
  emptyAssociationsFile,
  registerBidirectionalType,
  WORKSPACE_FILE_VERSION,
  type WorkspaceFile,
} from "../../src/index";

const ASSOC = "000000000000000000000000C1";
const NODE_A = "000000000000000000000000A1";
const NODE_B = "000000000000000000000000B1";
const HOME_A = "00000000000000000000000001";
const ARCHIVE_A = "00000000000000000000000002";
const HOME_B = "00000000000000000000000003";
const ARCHIVE_B = "00000000000000000000000004";

function workspace(home: string, archive: string): WorkspaceFile {
  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId: home,
    archiveNodeId: archive,
    protectedNodeIds: [home, archive],
    graphExplorer: { defaultAnchorNodeId: home },
    staticSite: { homeNodeId: home },
    quickLinks: [],
    branding: { appTitle: home === HOME_A ? "Corpus A" : "Corpus B" },
  };
}

function seedCorpus(root: string, home: string, archive: string): string {
  const content = join(root, "content");
  mkdirSync(join(content, "model"), { recursive: true });
  mkdirSync(join(content, "data", "nodes"), { recursive: true });
  mkdirSync(join(content, "data", "relationships"), { recursive: true });
  writeFileSync(join(content, "model", "workspace.json"), serializeWorkspaceFile(workspace(home, archive)));
  const associations = emptyAssociationsFile();
  registerBidirectionalType(associations, "Related", "Related", ASSOC);
  writeFileSync(join(content, "model", "associations.json"), serializeAssociationsFile(associations));
  return content;
}

describe("CompositeStore", () => {
  test("unions nodes, routes writes, dual-writes cross-corpus edges", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-composite-"));
    const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A);
    const contentB = seedCorpus(join(temp, "b"), HOME_B, ARCHIVE_B);

    const store = new CompositeStore([
      { id: "a", contentPath: contentA },
      { id: "b", contentPath: contentB },
    ]);

    store.writeNodeToCorpus("a", { id: NODE_A, properties: { title: "Node A" } }, "body a");
    store.writeNodeToCorpus("b", { id: NODE_B, properties: { title: "Node B" } }, "body b");

    expect(store.locateNode(NODE_A)).toBe("a");
    expect(store.locateNode(NODE_B)).toBe("b");
    expect(store.listNodeIds().sort()).toEqual([NODE_A, NODE_B].sort());
    expect(store.readNode(NODE_A)?.properties.title).toBe("Node A");

    store.upsertRelationship(NODE_A, NODE_B, ASSOC, { note: "cross" });

    const liveA = new CompositeStore([
      { id: "a", contentPath: contentA },
      { id: "b", contentPath: contentB },
    ]);
    // Re-open as solo ContentStores via composite children isn't exported; check via union read.
    expect(store.findContentEntry(NODE_A, NODE_B, ASSOC)?.properties?.note).toBe("cross");

    // Both corpora should have the file after dual-write — reopen composite and heal is no-op.
    const reopened = new CompositeStore([
      { id: "a", contentPath: contentA },
      { id: "b", contentPath: contentB },
    ]);
    expect(reopened.findContentEntry(NODE_A, NODE_B, ASSOC)?.properties?.note).toBe("cross");
    expect(reopened.readRelationshipsFile().relationships).toHaveLength(1);

    store.close();
    liveA.close();
    reopened.close();
  });

  test("refuses writes to readonly corpus and cross-edges when either side is readonly", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-composite-ro-"));
    const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A);
    const contentB = seedCorpus(join(temp, "b"), HOME_B, ARCHIVE_B);

    const store = new CompositeStore([
      { id: "a", contentPath: contentA, access: "readwrite" },
      { id: "b", contentPath: contentB, access: "readonly" },
    ]);

    store.writeNodeToCorpus("a", { id: NODE_A, properties: { title: "A" } });
    expect(() =>
      store.writeNodeToCorpus("b", { id: NODE_B, properties: { title: "B" } }),
    ).toThrow(CorpusReadonlyError);

    // Seed B node via direct ContentStore path by temporarily opening writable then reopening readonly.
    store.close();
    const seed = new CompositeStore([
      { id: "a", contentPath: contentA },
      { id: "b", contentPath: contentB },
    ]);
    seed.writeNodeToCorpus("b", { id: NODE_B, properties: { title: "B" } });
    seed.close();

    const ro = new CompositeStore([
      { id: "a", contentPath: contentA, access: "readwrite" },
      { id: "b", contentPath: contentB, access: "readonly" },
    ]);
    expect(() => ro.upsertRelationship(NODE_A, NODE_B, ASSOC, {})).toThrow(CorpusReadonlyError);
    ro.close();
  });

  test("fails boot on duplicate node ids", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-composite-dup-"));
    const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A);
    const contentB = seedCorpus(join(temp, "b"), HOME_B, ARCHIVE_B);

    const storeA = new ContentStore(contentA, { corpusId: "a" });
    storeA.writeNode({ id: NODE_A, properties: { title: "A" } });
    storeA.close();
    const storeB = new ContentStore(contentB, { corpusId: "b" });
    storeB.writeNode({ id: NODE_A, properties: { title: "Dup" } });
    storeB.close();

    expect(
      () =>
        new CompositeStore([
          { id: "a", contentPath: contentA },
          { id: "b", contentPath: contentB },
        ]),
    ).toThrow(CorpusConflictError);
  });

  test("listCorpora exposes workspace homes", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-composite-list-"));
    const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A);
    const contentB = seedCorpus(join(temp, "b"), HOME_B, ARCHIVE_B);
    const store = new CompositeStore([
      { id: "a", contentPath: contentA },
      { id: "b", contentPath: contentB, access: "readonly" },
    ]);
    const corpora = store.listCorpora();
    expect(corpora).toHaveLength(2);
    expect(corpora[0]!.workspace.homeNodeId).toBe(HOME_A);
    expect(corpora[1]!.access).toBe("readonly");
    expect(corpora[1]!.workspace.homeNodeId).toBe(HOME_B);
    store.close();
  });
});
