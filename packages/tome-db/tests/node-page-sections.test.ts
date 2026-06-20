import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "../src/graph";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodePageDetail } from "../src/node-page-sections";

describe("node-sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-"));
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  test("returns markdown as the first section", () => {
    db.upsertNode("page1", {
      title: "Alpha",
      body: "# Notes",
    });

    const detail = getNodePageDetail(db, "page1");
    expect(detail?.sections[0]).toEqual({ type: "markdown", body: "# Notes" });
  });

  test("adds relation sections grouped by edge label with edge properties as columns", () => {
    db.upsertNode("scene1", { title: "Opening", body: "" });
    db.upsertNode("feat1", { title: "Desperation" });
    db.upsertNode("insp1", { title: "Pride and Prejudice" });
    db.upsertRelationship("scene1", "feat1", "features", { ordinal: 0, weight: "strong" });
    db.upsertRelationship("scene1", "insp1", "inspirations", { ordinal: 1 });

    const detail = getNodePageDetail(db, "scene1");
    const relationSections = detail?.sections.filter((section) => section.type === "relations");

    expect(relationSections).toHaveLength(2);
    expect(relationSections?.[0]).toMatchObject({
      type: "relations",
      label: "features",
      title: "Features",
      addMode: "link-existing",
      columns: ["weight"],
      rows: [
        {
          targetId: "feat1",
          name: "Desperation",
          cells: { weight: "strong" },
        },
      ],
    });
    expect(relationSections?.[1]).toMatchObject({
      type: "relations",
      label: "inspirations",
      addMode: "link-existing",
      rows: [{ targetId: "insp1", name: "Pride and Prejudice" }],
    });
  });

  test("sets addMode none on structural one-to-many relation sections", () => {
    db.upsertNode("scene5", { title: "Bridge" });
    db.upsertNode("part1", { title: "The Orphanage" });
    db.upsertRelationship("scene5", "part1", "part", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene5");
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "part",
    );

    expect(partSection).toMatchObject({
      label: "part",
      addMode: "none",
    });
  });

  test("adds database table section for NotionDatabase records after markdown", () => {
    const databaseId = "db42345678901234567890123456789012";
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features DB"), body: "# About" });
    db.upsertNode("page4", { title: "Guest consultant" });
    db.upsertRelationship("page4", databaseId, IS_A_TYPE, {
      view: "default",
      row_index: 0,
      status: "Partial",
    });

    const detail = getNodePageDetail(db, databaseId);
    expect(detail?.properties).toBeNull();
    expect(detail?.sections.map((section) => section.type)).toEqual(["markdown", "database"]);
    expect(detail?.sections[1]).toMatchObject({
      type: "database",
      databaseView: {
        title: "Features DB",
        rows: [{ nodeId: "page4", name: "Guest consultant", cells: { status: "Partial" } }],
      },
    });
  });

  test("returns null properties when page has no type membership", () => {
    db.upsertNode("page-no-type", { title: "Orphan", body: "" });
    const detail = getNodePageDetail(db, "page-no-type");
    expect(detail?.properties).toBeNull();
  });

  test("shows Properties and IS_A relation section with scalars split between them", () => {
    const databaseId = "db52345678901234567890123456789012";
    db.upsertNode("page5", { title: "Scene A", body: "Prose" });
    db.upsertNode(databaseId, {
      ...typeTableMarkerProperties("Scene Archive"),
      notion_schema: JSON.stringify({
        syncedAt: "test",
        properties: {
          Name: { id: "title", name: "Name", type: "title", config: {} },
          Priority: { id: "Vpkf", name: "Priority", type: "select", config: {} },
        },
      }),
    });
    db.upsertRelationship("page5", databaseId, IS_A_TYPE, {
      view: "default",
      row_index: 3,
      priority: "High",
    });

    const detail = getNodePageDetail(db, "page5");
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === IS_A_TYPE,
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: IS_A_TYPE,
      title: "Scene Archive",
      typeNodeId: databaseId,
      addMode: "link-existing",
      columns: [],
      rows: [{ targetId: databaseId, name: "Scene Archive", cells: {} }],
    });
    expect(detail?.properties).toMatchObject({
      type: "properties",
      databaseId,
      typeTitle: "Scene Archive",
      columns: ["priority"],
      columnDefs: [
        {
          key: "priority",
          name: "Priority",
          type: "enum",
          enumId: "priority",
        },
      ],
      cells: { priority: "High" },
    });
  });

  test("normalizes legacy IN_DATABASE edges into Properties section", () => {
    const databaseId = "db62345678901234567890123456789012";
    db.upsertNode("page6", { title: "Legacy row" });
    db.upsertNode(databaseId, {
      ...typeTableMarkerProperties("Legacy Features"),
      notion_schema: JSON.stringify({
        syncedAt: "test",
        properties: {
          Name: { id: "title", name: "Name", type: "title", config: {} },
          Status: { id: "status", name: "Status", type: "select", config: {} },
        },
      }),
    });
    db.upsertRelationship("page6", databaseId, IS_A_TYPE, { status: "Unresolved" });

    const detail = getNodePageDetail(db, "page6");
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === IS_A_TYPE,
    );

    expect(membership).toMatchObject({
      label: IS_A_TYPE,
      addMode: "link-existing",
      columns: [],
      rows: [{ targetId: databaseId, name: "Legacy Features" }],
    });
    expect(detail?.properties).toMatchObject({
      databaseId,
      typeTitle: "Legacy Features",
      cells: { status: "Unresolved" },
    });
  });

  test("resolves typeNodeId by matching FEATURES label to NotionDatabase title", () => {
    const featuresTypeId = "f72345678901234567890123456789012";
    db.upsertNode("scene2", { title: "Chase" });
    db.upsertNode(featuresTypeId, { ...typeTableMarkerProperties("Features") });
    db.upsertRelationship("scene2", featuresTypeId, IS_A_TYPE, { row_index: 0 });
    db.upsertNode("feat2", { title: "Desperation" });
    db.upsertRelationship("scene2", "feat2", "features", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene2");
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "features",
    );

    expect(features).toMatchObject({
      title: "Features",
      typeNodeId: featuresTypeId,
    });
  });

  test("resolves typeNodeId by matching NotionDatabase title to relation label", () => {
    const inspTypeId = "f82345678901234567890123456789012";
    db.upsertNode("scene3", { title: "Ball" });
    db.upsertNode(inspTypeId, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertRelationship("scene3", inspTypeId, IS_A_TYPE, { row_index: 0 });
    db.upsertNode("insp2", { title: "Emma" });
    db.upsertRelationship("scene3", "insp2", "inspirations", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene3");
    const inspirations = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "inspirations",
    );

    expect(inspirations?.typeNodeId).toBe(inspTypeId);
    expect(inspirations?.title).toBe("Inspirations");
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
