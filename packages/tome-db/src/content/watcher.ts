import { watch, type FSWatcher } from "node:fs";
import type { CacheSync } from "./sync";
import {
  RELATIONSHIPS_FILENAME,
  RELATIONSHIP_TYPES_FILENAME,
  DYNAMIC_FIELDS_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  WORKSPACE_FILENAME,
  NODE_FILE_PATTERN,
  contentDataDir,
  contentModelDir,
} from "./paths";

const DEBOUNCE_MS = 200;

export class ContentWatcher {
  private dataWatcher: FSWatcher | null = null;
  private modelWatcher: FSWatcher | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private readonly sync: CacheSync,
    private readonly onError?: (err: Error) => void,
  ) {}

  start(): void {
    if (this.dataWatcher || this.modelWatcher) return;
    const root = this.sync.contentDir;
    this.dataWatcher = this.watchDir(contentDataDir(root), (name) => this.isRelevantDataFile(name));
    this.modelWatcher = this.watchDir(contentModelDir(root), (name) => this.isRelevantModelFile(name));
  }

  private watchDir(
    dir: string,
    isRelevant: (name: string) => boolean,
  ): FSWatcher | null {
    try {
      const watcher = watch(dir, (event, filename) => {
        if (this.closed || !filename || typeof filename !== "string") return;
        if (!isRelevant(filename)) return;
        this.schedule(filename);
      });
      watcher.on("error", (err) => {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
      return watcher;
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private isRelevantDataFile(name: string): boolean {
    return name === RELATIONSHIPS_FILENAME || NODE_FILE_PATTERN.test(name);
  }

  private isRelevantModelFile(name: string): boolean {
    return (
      name === RELATIONSHIP_TYPES_FILENAME ||
      name === SCHEMA_FILENAME ||
      name === DYNAMIC_FIELDS_FILENAME ||
      name === VIEWS_FILENAME ||
      name === WORKSPACE_FILENAME
    );
  }

  private schedule(filename: string): void {
    const existing = this.pending.get(filename);
    if (existing) clearTimeout(existing);
    this.pending.set(
      filename,
      setTimeout(() => {
        this.pending.delete(filename);
        if (this.closed || this.sync.isApplying()) return;
        try {
          this.sync.syncFile(filename);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }, DEBOUNCE_MS),
    );
  }

  close(): void {
    this.closed = true;
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.dataWatcher?.close();
    this.modelWatcher?.close();
    this.dataWatcher = null;
    this.modelWatcher = null;
  }
}
