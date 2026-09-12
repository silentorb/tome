import { useCallback, useEffect, useState } from "react";
import type { TomeCorpusPublic, WorkspacePublic } from "../shared/http-client";
import { isCacheSyncingError } from "../shared/http-client";
import type { EditorApi } from "./api/client";
import { corpusFromLocation } from "./node-links";
import type { CacheSyncProgressView } from "./components/CacheSyncProgressPanel";
import { cacheSyncProgressFromHealth } from "./components/CacheSyncProgressPanel";

const SYNC_POLL_MS = 400;

function syncProgressFromError(err: {
  phase?: string;
  progress?: number;
  current?: number;
  total?: number;
  message?: string;
}): CacheSyncProgressView {
  return {
    phase: err.phase,
    progress: err.progress,
    current: err.current,
    total: err.total,
    message: err.message,
  };
}

export function useCorpora(api: EditorApi) {
  const [corpora, setCorpora] = useState<TomeCorpusPublic[]>([]);
  const [activeCorpusId, setActiveCorpusId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheSync, setCacheSync] = useState<CacheSyncProgressView | null>(null);
  const [loadGeneration, setLoadGeneration] = useState(0);

  const applyCorpus = useCallback((list: TomeCorpusPublic[], corpusId: string | null) => {
    const id = corpusId && list.some((c) => c.id === corpusId) ? corpusId : list[0]?.id ?? null;
    setActiveCorpusId(id);
    const match = list.find((c) => c.id === id);
    setWorkspace(match?.workspace ?? null);
    return id;
  }, []);

  const refreshCorpora = useCallback(async () => {
    const list = await api.listCorpora();
    setCorpora(list);
    setError(null);
    setCacheSync(null);
    const id = applyCorpus(list, activeCorpusId);
    return { corpora: list, activeCorpusId: id };
  }, [api, activeCorpusId, applyCorpus]);

  const refreshWorkspace = useCallback(async () => {
    const { corpora: list, activeCorpusId: id } = await refreshCorpora();
    return list.find((c) => c.id === id)?.workspace ?? null;
  }, [refreshCorpora]);

  const setActiveCorpus = useCallback(
    (corpusId: string) => {
      applyCorpus(corpora, corpusId);
    },
    [applyCorpus, corpora],
  );

  const retryLoad = useCallback(() => {
    setLoadGeneration((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listCorpora();
        if (cancelled) return;
        setCorpora(list);
        setError(null);
        setCacheSync(null);
        applyCorpus(list, corpusFromLocation());
      } catch (err) {
        if (cancelled) return;
        if (isCacheSyncingError(err)) {
          setCacheSync(syncProgressFromError(err));
          setError(null);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setCacheSync(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, applyCorpus, loadGeneration]);

  useEffect(() => {
    if (!cacheSync) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const health = await api.getHealth();
        if (cancelled) return;
        if (health.ready) {
          setCacheSync(null);
          retryLoad();
          return;
        }
        setCacheSync(cacheSyncProgressFromHealth(health));
      } catch {
        /* keep last sync status; retry on next tick */
      }
      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void poll();
        }, SYNC_POLL_MS);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    // Only start/stop when syncing begins or ends — not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheSync presence is the gate
  }, [api, cacheSync != null, retryLoad]);

  const activeCorpus = corpora.find((c) => c.id === activeCorpusId) ?? null;
  const corpusReadonly = activeCorpus?.access === "readonly";

  return {
    corpora,
    activeCorpusId,
    activeCorpus,
    corpusReadonly,
    workspace,
    error,
    cacheSync,
    setCacheSync,
    setActiveCorpus,
    refreshWorkspace,
    refreshCorpora,
    retryLoad,
  };
}
