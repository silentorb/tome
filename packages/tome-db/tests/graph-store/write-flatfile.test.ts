import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { registerBidirectionalType, invalidateRelationshipTypesCache } from "tome-flatfile";
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

describe("graph store write path flatfile", async () => {
  test("link merge properties unlink without cache validation", async () => {
    const fixture = await createTestContentFixture("tome-graph-write-flatfile-");
    try {
      await seedTestNode(fixture, { id: TEST_HOME_NODE_ID, properties: { title: "Home" } });
      await seedTestNode(fixture, { id: SOURCE, properties: { title: "Source" } });
      await seedTestNode(fixture, { id: TARGET, properties: { title: "Target" } });
      const registry = fixture.ctx.store.readRelationshipTypesFile();
      const assoc = registerBidirectionalType(registry, "Dependents", "Dependencies");
      fixture.ctx.store.writeRelationshipTypesFile(registry);
      invalidateRelationshipTypesCache();

      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });
      const ctx = { ...fixture.ctx, graphStore: store };

      expect(await linkOutgoingRelationship(ctx, { sourceId: SOURCE, targetId: TARGET, type: assoc })).toBeNull();
      expect(await writeStoreFindRelationship(store, SOURCE, TARGET, assoc)).toBeTruthy();

      await writeStoreMergeRelationshipProperties(store, SOURCE, TARGET, assoc, { note: "linked" });
      expect((await writeStoreFindRelationship(store, SOURCE, TARGET, assoc))?.properties.note).toBe("linked");

      expect(await unlinkOutgoingRelationship(ctx, SOURCE, TARGET, assoc)).toBeNull();
      expect(await writeStoreFindRelationship(store, SOURCE, TARGET, assoc)).toBeNull();

      await store.close();
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("direct upsertRelationship on flatfile graph store", async () => {
    const fixture = await createTestContentFixture("tome-graph-write-upsert-");
    try {
      await seedTestNode(fixture, { id: SOURCE, properties: { title: "Source" } });
      await seedTestNode(fixture, { id: TARGET, properties: { title: "Target" } });
      const registry = fixture.ctx.store.readRelationshipTypesFile();
      const assoc = registerBidirectionalType(registry, "Links", "LinkedFrom");
      fixture.ctx.store.writeRelationshipTypesFile(registry);
      invalidateRelationshipTypesCache();

      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });

      await writeStoreUpsertRelationship(store, SOURCE, TARGET, assoc, { weight: 1 });
      expect((await writeStoreFindRelationship(store, SOURCE, TARGET, assoc))?.properties.weight).toBe(1);

      await writeStoreMergeRelationshipProperties(store, SOURCE, TARGET, assoc, { weight: 2 });
      expect((await writeStoreFindRelationship(store, SOURCE, TARGET, assoc))?.properties.weight).toBe(2);

      await store.close();
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });
});
