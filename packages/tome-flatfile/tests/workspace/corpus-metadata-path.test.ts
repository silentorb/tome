import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ContentStore,
  CORPUS_FILENAME,
  corpusFilePath,
  legacyWorkspaceFilePath,
  resolveCorpusMetadataPath,
  serializeWorkspaceFile,
  WORKSPACE_FILENAME,
  WORKSPACE_FILE_VERSION,
} from "../../src/index";

const SAMPLE = {
  version: WORKSPACE_FILE_VERSION,
  homeNodeId: "00000000000000000000000005",
  archiveNodeId: "00000000000000000000000002",
  protectedNodeIds: ["00000000000000000000000005", "00000000000000000000000002"],
  graphExplorer: { defaultAnchorNodeId: "0000000000000000000000002V" },
  staticSite: { homeNodeId: "0000000000000000000000000Y" },
  quickLinks: [] as { nodeId: string; label: string }[],
};

function tempContent(): string {
  const root = mkdtempSync(join(tmpdir(), "tome-corpus-meta-"));
  const content = join(root, "content");
  mkdirSync(join(content, "model"), { recursive: true });
  return content;
}

describe("corpus metadata filename dual-support", () => {
  test("resolveCorpusMetadataPath prefers corpus.json when both exist", () => {
    const content = tempContent();
    try {
      writeFileSync(
        corpusFilePath(content),
        serializeWorkspaceFile({ ...SAMPLE, branding: { appTitle: "FromCorpus" } }),
      );
      writeFileSync(
        legacyWorkspaceFilePath(content),
        serializeWorkspaceFile({ ...SAMPLE, branding: { appTitle: "FromLegacy" } }),
      );
      expect(resolveCorpusMetadataPath(content)).toBe(corpusFilePath(content));
      const store = new ContentStore(content, { corpusId: "t" });
      expect(store.readWorkspaceFile().branding?.appTitle).toBe("FromCorpus");
    } finally {
      rmSync(join(content, ".."), { recursive: true, force: true });
    }
  });

  test("loads legacy workspace.json when corpus.json is absent", () => {
    const content = tempContent();
    try {
      writeFileSync(
        legacyWorkspaceFilePath(content),
        serializeWorkspaceFile({ ...SAMPLE, branding: { appTitle: "LegacyOnly" } }),
      );
      expect(resolveCorpusMetadataPath(content)).toBe(legacyWorkspaceFilePath(content));
      const store = new ContentStore(content, { corpusId: "t" });
      expect(store.readWorkspaceFile().branding?.appTitle).toBe("LegacyOnly");
    } finally {
      rmSync(join(content, ".."), { recursive: true, force: true });
    }
  });

  test("writeWorkspaceFile always creates corpus.json", () => {
    const content = tempContent();
    try {
      writeFileSync(
        legacyWorkspaceFilePath(content),
        serializeWorkspaceFile({ ...SAMPLE, branding: { appTitle: "Legacy" } }),
      );
      const store = new ContentStore(content, { corpusId: "t" });
      const file = store.readWorkspaceFile();
      store.writeWorkspaceFile({
        ...file,
        branding: { ...file.branding, appTitle: "Written" },
      });
      expect(readFileSync(corpusFilePath(content), "utf-8")).toContain("Written");
      expect(corpusFilePath(content).endsWith(CORPUS_FILENAME)).toBe(true);
      expect(legacyWorkspaceFilePath(content).endsWith(WORKSPACE_FILENAME)).toBe(true);
    } finally {
      rmSync(join(content, ".."), { recursive: true, force: true });
    }
  });
});
