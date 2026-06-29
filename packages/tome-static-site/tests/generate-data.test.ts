import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MEMBER_OF_TYPE, typeTableMarkerProperties, VIEWS_FILE_VERSION } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestViews,
  seedTestWorkspace,
  TEST_STATIC_SITE_HOME_NODE_ID,
  type TestContentFixture,
} from "tome-db/content";
import { writeSiteData, defaultSiteDataPath } from "../src/generate-data";
import { tabPayloadKey } from "../src/lib/static-export";
import type { ResolvedConfig } from "../src/config";

describe("writeSiteData", () => {
  let fixture: TestContentFixture;
  let outDir: string;

  afterAll(() => {
    if (fixture) destroyTestContentFixture(fixture);
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  test("exports metadata, properties, relations, and multi-tab payloads", async () => {
    fixture = createTestContentFixture("tome-static-export-");
    outDir = mkdtempSync(join(tmpdir(), "tome-static-out-"));

    const typeId = "13458e628ba28073850dea0edb9acde2";
    const instanceId = "13458e628ba28073850dea0edb9acde3";
    const relatedId = "13458e628ba28073850dea0edb9acde4";

    seedTestNode(fixture, {
      id: typeId,
      properties: { ...typeTableMarkerProperties("Features DB"), body: "# About types" },
    });
    seedTestNode(fixture, {
      id: instanceId,
      properties: { title: "Hero", body: `Mentions [[${relatedId}]]` },
    });
    seedTestNode(fixture, {
      id: relatedId,
      properties: { title: "Related feat", body: `See [[${instanceId}]]` },
    });

    seedTestRelationships(fixture, [
      { source: instanceId, target: typeId, type: MEMBER_OF_TYPE, properties: { view: "default", row_index: 0, status: "Done" } },
      { source: instanceId, target: relatedId, type: "features", properties: { weight: "high" } },
    ]);

    seedTestViews(fixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "default",
          nodeId: typeId,
          relationshipType: "members",
          name: "Default",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "all",
          nodeId: typeId,
          relationshipType: "members",
          name: "All",
          sorts: [{ column: "name", direction: "desc" }],
        },
      ],
    });

    const config: ResolvedConfig = {
      repoRoot: fixture.tempDir,
      contentDir: join(fixture.tempDir, "content"),
      dbPath: join(fixture.tempDir, "test.sqlite"),
      outDir: join(outDir, "web"),
      base: "/",
    };

    process.env.TOME_CONTENT_PATH = config.contentDir;

    const outFile = join(outDir, "site-data.json");
    const data = await writeSiteData(config, outFile);

    expect(data.homeNodeId).toBe(TEST_STATIC_SITE_HOME_NODE_ID);
    expect(data.staticSiteHeader).toBe("Tome");
    expect(data.staticSiteFooter).toBeUndefined();
    expect(data.pathById[instanceId.toLowerCase()]).toBe(instanceId.toLowerCase());
    expect(data.aliasToId).toEqual({});

    const aliasId = "13458e628ba28073850dea0edb9acde5";
    seedTestNode(fixture, {
      id: aliasId,
      properties: { title: "Alias page", url_alias: "design/alias-test", body: "Alias body" },
    });
    const aliasData = await writeSiteData(config, join(outDir, "site-data-alias.json"));
    expect(aliasData.pathById[aliasId.toLowerCase()]).toBe("design/alias-test");
    expect(aliasData.aliasToId["design/alias-test"]).toBe(aliasId.toLowerCase());
    const aliasNode = aliasData.nodes.find((node) => node.id === aliasId);
    expect(aliasNode?.urlPath).toBe("design/alias-test");

    const instance = data.nodes.find((node) => node.id === instanceId);
    expect(instance).toBeDefined();
    expect(instance?.properties?.typeTitle).toBe("Features DB");
    expect(instance?.properties?.cells.status).toBeTruthy();
    expect(instance?.metadata.backlinks).toHaveLength(1);
    expect(instance?.metadata.backlinks[0]?.sourceId).toBe(relatedId);
    const relationSection = instance?.sections.find((section) => section.type === "relations");
    expect(relationSection?.type).toBe("relations");
    if (relationSection?.type === "relations") {
      expect(relationSection.rows[0]?.targetId).toBe(relatedId);
    }

    const typeNode = data.nodes.find((node) => node.id === typeId);
    expect(typeNode?.itemsTabs?.items).toHaveLength(2);
    expect(typeNode?.sections.some((section) => section.type === "database")).toBe(true);

    const extraKey = tabPayloadKey(typeId, "all");
    expect(data.tabItemsPayloads[extraKey]?.kind).toBe("database");
    expect(data.tabRoutes).toEqual([{ nodeId: typeId, tabId: "all" }]);

    expect(defaultSiteDataPath(join(outDir, "pkg"))).toMatch(/site-data\.json$/);
  });

  test("exports resolved static site footer from workspace branding", async () => {
    const footerFixture = createTestContentFixture("tome-static-footer-");
    const footerOutDir = mkdtempSync(join(tmpdir(), "tome-static-footer-out-"));

    try {
      seedTestWorkspace(footerFixture, {
        branding: {
          staticSiteFooterOrganization: "Silent Orb",
        },
      });

      const config: ResolvedConfig = {
        repoRoot: footerFixture.tempDir,
        contentDir: join(footerFixture.tempDir, "content"),
        dbPath: join(footerFixture.tempDir, "footer.sqlite"),
        outDir: join(footerOutDir, "web"),
        base: "/",
      };

      const orgOnly = await writeSiteData(config, join(footerOutDir, "org-only.json"));
      const year = new Date().getFullYear();
      expect(orgOnly.staticSiteFooter).toBe(`© Copyright ${year} Silent Orb`);

      seedTestWorkspace(footerFixture, {
        branding: {
          staticSiteFooter: "Built in :year:",
        },
      });
      const customOnly = await writeSiteData(config, join(footerOutDir, "custom-only.json"));
      expect(customOnly.staticSiteFooter).toBe(`Built in ${year}`);
    } finally {
      destroyTestContentFixture(footerFixture);
      rmSync(footerOutDir, { recursive: true, force: true });
    }
  });
});
