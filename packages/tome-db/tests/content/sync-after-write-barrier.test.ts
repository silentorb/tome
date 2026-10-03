import { afterAll, describe, expect, test } from "bun:test";
import { RELATIONSHIPS_SYNC_MARKER, projectionTypeForEndpoint } from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
} from "../../src/content/test-helpers";

const SET_ID = "000000000000000000000000S1";
const MEMBER_ID = "000000000000000000000000M1";

describe("CacheSync syncAfterWrite barrier", async () => {
  const fixture = await createTestContentFixture("tome-sync-after-write-");

  await seedTestNode(fixture, { id: SET_ID, properties: { title: "Set" } });
  await seedTestNode(fixture, { id: MEMBER_ID, properties: { title: "Member" } });
  await seedTestRelationships(fixture, [
    {
      source: MEMBER_ID,
      target: SET_ID,
      type: "ordered_member_of",
      properties: { order: "10" },
    },
  ]);

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("syncAfterWrite queues behind an in-flight expand and lands final flatfile order", async () => {
    const memberProjection = projectionTypeForEndpoint(
      TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      1,
    );
    const edgeKey = `${MEMBER_ID}:${memberProjection}:${SET_ID}`;

    const before = await fixture.ctx.cache.getRelationship(edgeKey);
    expect(before?.properties.order).toBe("10");

    // Hold the exclusive apply lock the same way CacheSync does: start a sync,
    // mutate flatfile while it runs, then await a second syncAfterWrite.
    const first = fixture.ctx.sync.syncAfterWrite(RELATIONSHIPS_SYNC_MARKER);

    const file = fixture.ctx.store.readRelationshipsFile();
    const entry = file.relationships.find(
      (row) =>
        row.type === TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID &&
        ((row.a === MEMBER_ID && row.b === SET_ID) ||
          (row.a === SET_ID && row.b === MEMBER_ID)),
    );
    expect(entry).toBeDefined();
    entry!.properties = { ...entry!.properties, order: "99" };
    fixture.ctx.store.writeRelationshipsFile(file);

    const second = fixture.ctx.sync.syncAfterWrite(RELATIONSHIPS_SYNC_MARKER);
    await Promise.all([first, second]);

    const after = await fixture.ctx.cache.getRelationship(edgeKey);
    expect(after?.properties.order).toBe("99");
  });
});
