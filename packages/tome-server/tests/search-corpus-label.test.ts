import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompositeStore,
  ContentStore,
  emptyAssociationsFile,
  registerBidirectionalType,
  serializeAssociationsFile,
  serializeWorkspaceFile,
  WORKSPACE_FILE_VERSION,
  type WorkspaceFile,
} from "tome-flatfile";
import { GraphDatabase } from "tome-sqlite";
import { openTomeGraphServices } from "../src/graph-services";

const ASSOC = "000000000000000000000000C1";
const NODE_A = "000000000000000000000000A1";
const NODE_B = "000000000000000000000000B1";
const HOME_A = "00000000000000000000000001";
const ARCHIVE_A = "00000000000000000000000002";
const HOME_B = "00000000000000000000000003";
const ARCHIVE_B = "00000000000000000000000004";

function workspace(home: string, archive: string, appTitle: string): WorkspaceFile {
  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId: home,
    archiveNodeId: archive,
    protectedNodeIds: [home, archive],
    graphExplorer: { defaultAnchorNodeId: home },
    staticSite: { homeNodeId: home },
    quickLinks: [],
    branding: { appTitle },
  };
}

function seedCorpus(
  root: string,
  home: string,
  archive: string,
  appTitle: string,
): string {
  const content = join(root, "content");
  mkdirSync(join(content, "model"), { recursive: true });
  mkdirSync(join(content, "data", "nodes"), { recursive: true });
  mkdirSync(join(content, "data", "relationships"), { recursive: true });
  writeFileSync(
    join(content, "model", "workspace.json"),
    serializeWorkspaceFile(workspace(home, archive, appTitle)),
  );
  const associations = emptyAssociationsFile();
  registerBidirectionalType(associations, "Related", "Related", ASSOC);
  writeFileSync(
    join(content, "model", "associations.json"),
    serializeAssociationsFile(associations),
  );
  return content;
}

describe("search corpusLabel enrichment", () => {
  test("labels foreign hits when activeCorpusId is set in a multi-corpus session", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-search-corpus-label-"));
    try {
      const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A, "Corpus A");
      const contentB = seedCorpus(join(temp, "b"), HOME_B, ARCHIVE_B, "Corpus B");
      const store = new CompositeStore([
        { id: "a", contentPath: contentA },
        { id: "b", contentPath: contentB },
      ]);
      store.writeNodeToCorpus("a", { id: NODE_A, properties: { title: "Alpha Shared" } }, "");
      store.writeNodeToCorpus("b", { id: NODE_B, properties: { title: "Beta Shared" } }, "");

      const cache = new GraphDatabase(join(temp, "session.sqlite"));
      const services = openTomeGraphServices({ store, cache });

      const foreign = services.search("Shared", 10, undefined, { activeCorpusId: "a" });
      const beta = foreign.find((row) => row.id === NODE_B);
      const alpha = foreign.find((row) => row.id === NODE_A);
      expect(beta?.corpusId).toBe("b");
      expect(beta?.corpusLabel).toBe("Corpus B");
      expect(alpha?.corpusId).toBe("a");
      expect(alpha?.corpusLabel).toBeUndefined();

      const withoutActive = services.search("Shared", 10);
      expect(withoutActive.every((row) => row.corpusLabel === undefined)).toBe(true);

      services.close();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  test("never sets corpusLabel in a solo corpus session", () => {
    const temp = mkdtempSync(join(tmpdir(), "tome-search-corpus-label-solo-"));
    try {
      const contentA = seedCorpus(join(temp, "a"), HOME_A, ARCHIVE_A, "Corpus A");
      const store = new ContentStore(contentA);
      store.writeNode({ id: NODE_A, properties: { title: "Solo Node" } }, "");

      const cache = new GraphDatabase(join(temp, "session.sqlite"));
      const services = openTomeGraphServices({ store, cache });

      const hits = services.search("Solo", 10, undefined, { activeCorpusId: "other" });
      expect(hits).toHaveLength(1);
      expect(hits[0]?.corpusLabel).toBeUndefined();

      services.close();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
