import { describe, expect, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { TableRowsQuery, TableRowsWindow } from "tome-graph-interfaces";
import { useWindowedTableRows } from "../../../src/webview/hooks/useWindowedTableRows";

function Probe(props: {
  seedRows: string[];
  seedWindow: TableRowsWindow;
  q: string;
  fetchPage: (query: TableRowsQuery) => Promise<{ rows: string[]; rowsWindow: TableRowsWindow }>;
  onState: (state: { rows: string[]; rowsWindow: TableRowsWindow }) => void;
}) {
  const { rows, rowsWindow, reloadFromStart } = useWindowedTableRows({
    seedKey: "table",
    seed: { rows: props.seedRows, rowsWindow: props.seedWindow },
    q: props.q,
    fetchPage: props.fetchPage,
    debounceMs: 10,
  });

  useEffect(() => {
    props.onState({ rows, rowsWindow });
  }, [rows, rowsWindow, props]);

  useEffect(() => {
    void reloadFromStart;
  }, [reloadFromStart]);

  return <div data-testid="rows">{rows.join(",")}</div>;
}

describe("useWindowedTableRows", () => {
  test("keeps seeded first batch without refetch when q is empty", async () => {
    let fetches = 0;
    const states: Array<{ rows: string[]; rowsWindow: TableRowsWindow }> = [];
    render(
      <Probe
        seedRows={["a", "b"]}
        seedWindow={{ offset: 0, limit: 50, total: 2, hasMore: false }}
        q=""
        fetchPage={async () => {
          fetches += 1;
          return {
            rows: ["x"],
            rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
          };
        }}
        onState={(state) => states.push(state)}
      />,
    );

    await waitFor(() => {
      expect(states.at(-1)?.rows).toEqual(["a", "b"]);
    });
    expect(fetches).toBe(0);
  });

  test("refetches from start when search query is set", async () => {
    let fetches = 0;
    const states: Array<{ rows: string[]; rowsWindow: TableRowsWindow }> = [];
    render(
      <Probe
        seedRows={["a", "b", "c"]}
        seedWindow={{ offset: 0, limit: 50, total: 3, hasMore: false }}
        q="bee"
        fetchPage={async (query) => {
          fetches += 1;
          expect(query.q).toBe("bee");
          expect(query.offset).toBe(0);
          return {
            rows: ["b"],
            rowsWindow: { offset: 0, limit: 50, total: 1, hasMore: false },
          };
        }}
        onState={(state) => states.push(state)}
      />,
    );

    await waitFor(() => {
      expect(states.some((state) => state.rows.join(",") === "b")).toBe(true);
    });
    expect(fetches).toBeGreaterThanOrEqual(1);
  });
});
