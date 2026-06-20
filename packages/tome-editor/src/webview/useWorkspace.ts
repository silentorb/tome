import { useEffect, useState } from "react";
import type { WorkspacePublic } from "../shared/http-client";
import type { EditorApi } from "./api/client";

export function useWorkspace(api: EditorApi) {
  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ws = await api.getWorkspace();
        if (!cancelled) setWorkspace(ws);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return { workspace, error };
}
