import type { SearchMatchPreview } from "tome-graph-interfaces";

export type TomeSearchRequest = {
  query: string;
  limit: number;
  allowedTypeIds?: readonly string[];
  allowedNodeIds?: ReadonlySet<string>;
};

export type TomeSearchHit = {
  id: string;
  title: string;
  matchPreview?: SearchMatchPreview;
};

/**
 * Active search backend. Implementations return already-ordered hits.
 * Optional lifecycle hooks for index warmup / shutdown.
 */
export interface TomeSearch {
  search(request: TomeSearchRequest): TomeSearchHit[] | Promise<TomeSearchHit[]>;
  ensureReady?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export type SearcherOpenContext = {
  /** Merged extension + component params. */
  params: Record<string, unknown>;
  /** Optional host-provided handles (e.g. opened FTS SyncEndpoint id). */
  dataStoreId?: string;
  /** Opaque host extras (registry lookup, etc.). */
  host?: SearcherHostServices;
};

export type SearcherHostServices = {
  /** Resolve an opened sync sink / search index by dataStore id when present. */
  getSearcherBackend?(dataStoreId: string): unknown;
  /**
   * Session query cache for SQL LIKE searcher.
   * Typed loosely here to avoid a service-interfaces dependency; callers cast.
   */
  getQueryCache?(): unknown;
};

export type SearcherRegistration = {
  implementationId: string;
  open(ctx: SearcherOpenContext): TomeSearch | Promise<TomeSearch>;
};

export interface SearcherHost {
  registerSearcher(registration: SearcherRegistration): void;
}

export type SearcherModule = {
  register(host: SearcherHost): void;
};
