/** Worker-side RPC protocol for GraphDatabase. */

export type SqliteWorkerRequest =
  | {
      kind: "open";
      id: number;
      dbPath: string;
      clean?: boolean;
      memberPerspectives?: string[];
    }
  | {
      kind: "call";
      id: number;
      method: string;
      args: unknown[];
    }
  | {
      kind: "close";
      id: number;
    };

export type SqliteWorkerResponse =
  | { kind: "ok"; id: number; result?: unknown }
  | { kind: "error"; id: number; message: string; stack?: string };
