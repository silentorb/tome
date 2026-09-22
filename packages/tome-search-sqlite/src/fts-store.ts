import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { ImpCollectionResult } from "tome-graph-interfaces";
import type { SyncEndpoint, SyncSignal, SyncSourceRead } from "tome-db/sync";
import { allNodesForSearchGraph, nodeByIdForSearchGraph } from "./search-graphs";
import { createFtsSearch } from "./fts-search";
import type { TomeSearch } from "tome-interfaces/search";

export type SearchDocument = {
  id: string;
  title?: string | null;
  alias?: string | null;
  body?: string | null;
  typeIds?: readonly string[];
};

export type SearchSqliteOpenOptions = {
  dbPath?: string;
  clean?: boolean;
  /** Test/production override: list all documents without Imp. */
  listDocuments?: () => SearchDocument[] | Promise<SearchDocument[]>;
  /** Test/production override: fetch one document without Imp. */
  getDocument?: (id: string) => SearchDocument | null | Promise<SearchDocument | null>;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function typeIdsFromRow(row: Record<string, unknown>): string[] {
  const raw = row.typeIds ?? row.type_ids;
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v)).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function documentFromRow(row: Record<string, unknown>): SearchDocument | null {
  const id = row.id;
  if (typeof id !== "string" || !id) return null;
  return {
    id,
    title: stringField(row.title) || null,
    alias: stringField(row.alias) || null,
    body: stringField(row.body) || null,
    typeIds: typeIdsFromRow(row),
  };
}

async function awaitResult(
  result: ImpCollectionResult | Promise<ImpCollectionResult>,
): Promise<ImpCollectionResult> {
  return result instanceof Promise ? await result : result;
}

export class FtsStore {
  readonly path: string;
  private readonly db: Database;
  private readonly listDocuments?: SearchSqliteOpenOptions["listDocuments"];
  private readonly getDocument?: SearchSqliteOpenOptions["getDocument"];

  constructor(options: SearchSqliteOpenOptions = {}) {
    const dbPath = options.dbPath?.trim();
    if (!dbPath) {
      throw new Error("tome-search-sqlite open() requires options.dbPath");
    }
    this.path = dbPath;
    this.listDocuments = options.listDocuments;
    this.getDocument = options.getDocument;

    if (options.clean) {
      try {
        rmSync(dbPath, { force: true });
      } catch {
        /* ignore */
      }
    }

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        id UNINDEXED,
        title,
        alias,
        body,
        tokenize = 'porter'
      );
      CREATE TABLE IF NOT EXISTS node_type_ids (
        node_id TEXT NOT NULL,
        type_id TEXT NOT NULL,
        PRIMARY KEY (node_id, type_id)
      );
      CREATE INDEX IF NOT EXISTS idx_node_type_ids_type ON node_type_ids(type_id);
    `);
  }

  asSearch(): TomeSearch {
    return createFtsSearch(this.db);
  }

  asEndpoint(id = "fts"): SyncEndpoint {
    return {
      id,
      capabilities: {
        kind: "fts",
        canBeObserved: false,
        canObserve: true,
      },
      asSource(): SyncSourceRead {
        throw new Error(`FTS data store "${id}" is not an Imp query source for sync`);
      },
      apply: (signal) => this.apply(signal),
    };
  }

  async apply(signal: SyncSignal): Promise<void> {
    if (signal.scope.mode === "full") {
      await this.applyFull(signal.source);
      return;
    }

    const { nodes } = signal.scope.changes;
    for (const id of nodes.deleted) {
      this.deleteDocument(id);
    }
    for (const id of [...nodes.created, ...nodes.modified]) {
      const doc = await this.resolveDocument(signal.source, id);
      if (doc) this.upsertDocument(doc);
      else this.deleteDocument(id);
    }
  }

  private async applyFull(source: SyncSourceRead): Promise<void> {
    this.db.exec("DELETE FROM nodes_fts;");
    this.db.exec("DELETE FROM node_type_ids;");

    const docs = await this.resolveAllDocuments(source);
    const tx = this.db.transaction((documents: SearchDocument[]) => {
      for (const doc of documents) this.upsertDocument(doc);
    });
    tx(docs);
  }

  private async resolveAllDocuments(source: SyncSourceRead): Promise<SearchDocument[]> {
    if (this.listDocuments) {
      return [...(await this.listDocuments())];
    }
    const result = await awaitResult(source.executeImp(allNodesForSearchGraph()));
    const docs: SearchDocument[] = [];
    for (const row of result.rows) {
      const doc = documentFromRow(row);
      if (doc) docs.push(doc);
    }
    return docs;
  }

  private async resolveDocument(
    source: SyncSourceRead,
    id: string,
  ): Promise<SearchDocument | null> {
    if (this.getDocument) {
      return (await this.getDocument(id)) ?? null;
    }
    if (this.listDocuments) {
      const all = await this.listDocuments();
      return all.find((d) => d.id === id) ?? null;
    }
    const result = await awaitResult(source.executeImp(nodeByIdForSearchGraph(id)));
    const row = result.rows[0];
    return row ? documentFromRow(row) : null;
  }

  upsertDocument(doc: SearchDocument): void {
    this.db
      .prepare("DELETE FROM nodes_fts WHERE id = ?")
      .run(doc.id);
    this.db
      .prepare(
        `INSERT INTO nodes_fts (id, title, alias, body)
         VALUES (?, ?, ?, ?)`,
      )
      .run(doc.id, doc.title ?? "", doc.alias ?? "", doc.body ?? "");

    this.db.prepare("DELETE FROM node_type_ids WHERE node_id = ?").run(doc.id);
    if (doc.typeIds && doc.typeIds.length > 0) {
      const insertType = this.db.prepare(
        "INSERT OR IGNORE INTO node_type_ids (node_id, type_id) VALUES (?, ?)",
      );
      for (const typeId of doc.typeIds) {
        insertType.run(doc.id, typeId);
      }
    }
  }

  deleteDocument(id: string): void {
    this.db.prepare("DELETE FROM nodes_fts WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM node_type_ids WHERE node_id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}
