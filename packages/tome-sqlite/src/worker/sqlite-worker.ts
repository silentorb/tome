/// <reference lib="webworker" />
import { GraphDatabase } from "../graph";
import type { SqliteWorkerRequest, SqliteWorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let db: GraphDatabase | null = null;

function respond(msg: SqliteWorkerResponse): void {
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<SqliteWorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.kind === "open") {
      if (db) {
        db.close();
        db = null;
      }
      db = new GraphDatabase(msg.dbPath, {
        clean: msg.clean,
        // Codec applied on the main-thread proxy — identity in the worker.
        memberPerspectives: undefined,
      });
      if (msg.memberPerspectives) {
        db.setMemberPerspectives(msg.memberPerspectives);
      }
      respond({ kind: "ok", id: msg.id });
      return;
    }

    if (msg.kind === "close") {
      db?.close();
      db = null;
      respond({ kind: "ok", id: msg.id });
      return;
    }

    if (msg.kind === "call") {
      if (!db) {
        respond({ kind: "error", id: msg.id, message: "SQLite worker database is not open" });
        return;
      }
      if (msg.method === "setMemberPerspectives") {
        db.setMemberPerspectives((msg.args[0] as string[]) ?? []);
        respond({ kind: "ok", id: msg.id, result: undefined });
        return;
      }
      const fn = (db as unknown as Record<string, (...a: unknown[]) => unknown>)[msg.method];
      if (typeof fn !== "function") {
        respond({
          kind: "error",
          id: msg.id,
          message: `Unknown GraphDatabase method: ${msg.method}`,
        });
        return;
      }
      // Structured clone cannot transfer Set — convert ReadonlySet args to arrays when needed.
      const args = msg.args.map((arg) => {
        if (arg instanceof Set) return arg;
        return arg;
      });
      const result = fn.apply(db, args);
      respond({ kind: "ok", id: msg.id, result });
      return;
    }

    respond({
      kind: "error",
      id: (msg as { id: number }).id,
      message: `Unknown worker message kind`,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    respond({
      kind: "error",
      id: msg.id,
      message: error.message,
      stack: error.stack,
    });
  }
};
