import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiHandler, UserSettingsStore } from "../src/index";
import {
  configureProfiling,
  openProfilingStore,
  recordProfilingSample,
  resetProfilingForTests,
} from "tome-service-interfaces";
import type { TomeGraphServices } from "tome-graph-interfaces";
import type { Graph } from "imp-core-types";

function stubServices(): TomeGraphServices {
  return {
    getHomeId: () => "AAAAAAAAAAAAAAAAAAAAAAAAAA",
    listCorpora: () => [],
    getWorkspace: () => {
      throw new Error("not used");
    },
  } as unknown as TomeGraphServices;
}

/** input → filter(kind = "http") → sort(ms desc) → limit(10) → output */
function httpSamplesGraph(): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      col: { id: "col", type: "column", inputs: { name: "kind" } },
      lit: { id: "lit", type: "literal", inputs: { value: "http" } },
      eq: { id: "eq", type: "equals", inputs: {} },
      filter: { id: "filter", type: "filter", inputs: {} },
      sort: {
        id: "sort",
        type: "sort",
        inputs: { column: "ms", direction: "desc" },
      },
      limit: { id: "limit", type: "limit", inputs: { count: 10 } },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e_col: { from: { node: "col", port: "value" }, to: { node: "eq", port: "left" } },
      e_lit: { from: { node: "lit", port: "value" }, to: { node: "eq", port: "right" } },
      e_pred: {
        from: { node: "eq", port: "value" },
        to: { node: "filter", port: "predicate" },
      },
      e_in: {
        from: { node: "in", port: "value" },
        to: { node: "filter", port: "collection" },
      },
      e_filter: {
        from: { node: "filter", port: "collection" },
        to: { node: "sort", port: "collection" },
      },
      e_sort: {
        from: { node: "sort", port: "collection" },
        to: { node: "limit", port: "collection" },
      },
      e_out: {
        from: { node: "limit", port: "collection" },
        to: { node: "out", port: "value" },
      },
    },
  };
}

describe("createApiHandler profiling", () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    resetProfilingForTests();
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  function openTempStore(): string {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-profiling-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "tome-profiling.sqlite");
    openProfilingStore(dbPath);
    return dbPath;
  }

  test("GET /api/debug/profiling is 404 when profiling is off", async () => {
    configureProfiling({
      enabled: false,
      verbose: false,
      slowMs: 100,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profiling-off-settings.json"),
    );
    const res = await handler(new Request("http://127.0.0.1/api/debug/profiling"));
    expect(res.status).toBe(404);
    handler.close();
  });

  test("records slow HTTP samples and exposes /api/debug/profiling when enabled", async () => {
    configureProfiling({
      enabled: true,
      verbose: false,
      slowMs: 0,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    const dbPath = openTempStore();
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profiling-on-settings.json"),
    );

    const homeRes = await handler(new Request("http://127.0.0.1/api/home"));
    expect(homeRes.status).toBe(200);

    const profilingRes = await handler(new Request("http://127.0.0.1/api/debug/profiling"));
    expect(profilingRes.status).toBe(200);
    const body = (await profilingRes.json()) as {
      config: { enabled: boolean; slowMs: number; maxMb: number; batchDeleteMb: number };
      dbPath: string | null;
    };
    expect(body.config.enabled).toBe(true);
    expect(body.config.maxMb).toBe(32);
    expect(body.dbPath).toBe(dbPath);

    handler.close();
  });

  test("POST /api/debug/profiling/execute-imp filters samples via Imp", async () => {
    configureProfiling({
      enabled: true,
      verbose: true,
      slowMs: 0,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    openTempStore();
    recordProfilingSample("http", 12, "GET /api/a → 200");
    recordProfilingSample("sql", 99, "SELECT 1 (0 params)");
    recordProfilingSample("http", 40, "GET /api/b → 200");

    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profiling-imp-settings.json"),
    );
    const res = await handler(
      new Request("http://127.0.0.1/api/debug/profiling/execute-imp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: httpSamplesGraph() }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      columns: string[];
      rows: { kind: string; ms: number; detail: string }[];
    };
    expect(body.rows.every((r) => r.kind === "http")).toBe(true);
    expect(body.rows[0]?.ms).toBe(40);
    expect(body.rows).toHaveLength(2);
    handler.close();
  });

  test("POST /api/debug/profiling/execute-imp is 404 when profiling is off", async () => {
    configureProfiling({
      enabled: false,
      verbose: false,
      slowMs: 100,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profiling-imp-off-settings.json"),
    );
    const res = await handler(
      new Request("http://127.0.0.1/api/debug/profiling/execute-imp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: httpSamplesGraph() }),
      }),
    );
    expect(res.status).toBe(404);
    handler.close();
  });
});
