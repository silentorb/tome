import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { registerBidirectionalType, invalidateAssociationsCache } from "tome-flatfile";
import { openFlatfileQueryableGraphStore } from "../../src/graph-store/composed-graph-store";
import {
  writeStoreFindRelationship,
  writeStoreMergeRelationshipProperties,
  writeStoreUpsertRelationship,
} from "../../src/graph-store/relationship-write";
import {
  linkOutgoingRelationship,
  unlinkOutgoingRelationship,
} from "../../src/relationship-link-mutations";

const SOURCE = "0000000000000000000000001C";
const TARGET = "0000000000000000000000001X";

describe("graph store write path flatfile", () => {
  test("link merge properties unlink without cache validation", () => {
    const fixture = createTestContentFixture("tome-graph-write-flatfile-");
    try {
      seedTestNode(fixture, { id: TEST_HOME_NODE_ID, properties: { title: "Home" } });
      seedTestNode(fixture, { id: SOURCE, properties: { title: "Source" } });
      seedTestNode(fixture, { id: TARGET, properties: { title: "Target" } });
      const registry = fixture.ctx.store.readAssociationsFile();
      const assoc = registerBidirectionalType(registry, "Dependents", "Dependencies");
      fixture.ctx.store.writeAssociationsFile(registry);
      invalidateAssociationsCache();

      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });
      const ctx = { ...fixture.ctx, graphStore: store };

      expect(linkOutgoingRelationship(ctx, { sourceId: SOURCE, targetId: TARGET, type: assoc })).toBeNull();
      expect(writeStoreFindRelationship(store, SOURCE, TARGET, assoc)).toBeTruthy();

      writeStoreMergeRelationshipProperties(store, SOURCE, TARGET, assoc, { note: "linked" });
      expect(writeStoreFindRelationship(store, SOURCE, TARGET, assoc)?.properties.note).toBe("linked");

      expect(unlinkOutgoingRelationship(ctx, SOURCE, TARGET, assoc)).toBeNull();
      expect(writeStoreFindRelationship(store, SOURCE, TARGET, assoc)).toBeNull();

      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("direct upsertRelationship on flatfile graph store", () => {
    const fixture = createTestContentFixture("tome-graph-write-upsert-");
    try {
      seedTestNode(fixture, { id: SOURCE, properties: { title: "Source" } });
      seedTestNode(fixture, { id: TARGET, properties: { title: "Target" } });
      const registry = fixture.ctx.store.readAssociationsFile();
      const assoc = registerBidirectionalType(registry, "Links", "LinkedFrom");
      fixture.ctx.store.writeAssociationsFile(registry);
      invalidateAssociationsCache();

      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });

      writeStoreUpsertRelationship(store, SOURCE, TARGET, assoc, { weight: 1 });
      expect(writeStoreFindRelationship(store, SOURCE, TARGET, assoc)?.properties.weight).toBe(1);

      writeStoreMergeRelationshipProperties(store, SOURCE, TARGET, assoc, { weight: 2 });
      expect(writeStoreFindRelationship(store, SOURCE, TARGET, assoc)?.properties.weight).toBe(2);

      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
