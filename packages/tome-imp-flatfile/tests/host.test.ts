import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ExecutionRow } from "imp-execution";
import { createFlatfileExecutionHost } from "../src/host";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "tome-db/content/test-helpers";

function row(id: string, title: string, body = ""): ExecutionRow {
  return {
    id,
    properties: { title, body },
    is_archived: false,
  };
}

describe("createFlatfileExecutionHost textSearch", () => {
  let fixture: TestContentFixture;
  const titleHit = "0000000000000000000000001A";
  const bodyOnly = "0000000000000000000000001B";

  beforeAll(() => {
    fixture = createTestContentFixture("tome-imp-flatfile-host-");
    seedTestNode(fixture, {
      id: titleHit,
      properties: { title: "Surreal Title", body: "no marker" },
    });
    seedTestNode(fixture, {
      id: bodyOnly,
      properties: { title: "Other", body: "contains surreal-body text" },
    });
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("ranks title matches before body-only matches", async () => {
    const host = createFlatfileExecutionHost(fixture.ctx.graphStore, { liveOnly: true });
    const input = await Promise.resolve(host.listInputRows());
    const results = await Promise.resolve(host.textSearch!(input, "surreal"));
    expect(results.map((r) => r.id)).toEqual([titleHit, bodyOnly]);
  });
});
