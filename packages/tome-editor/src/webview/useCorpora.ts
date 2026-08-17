import { useCallback, useEffect, useState } from "react";
import type { TomeCorpusPublic, WorkspacePublic } from "../shared/http-client";
import type { EditorApi } from "./api/client";
import { corpusFromLocation } from "./node-links";

export function useCorpora(api: EditorApi) {
  const [corpora, setCorpora] = useState<TomeCorpusPublic[]>([]);
  const [activeCorpusId, setActiveCorpusId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listCorpora();
        if (cancelled) return;
        setCorpora(list);
        applyCorpus(list, corpusFromLocation());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, applyCorpus]);

  const activeCorpus = corpora.find((c) => c.id === activeCorpusId) ?? null;
  const corpusReadonly = activeCorpus?.access === "readonly";

  return {
    corpora,
    activeCorpusId,
    activeCorpus,
    corpusReadonly,
    workspace,
    error,
    setActiveCorpus,
    refreshWorkspace,
    refreshCorpora,
  };
}
