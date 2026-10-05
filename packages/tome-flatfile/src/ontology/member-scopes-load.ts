import type { MemberScope } from "tome-ontology";
import { ontologyFilePath } from "../content/paths";
import { existsSync, statSync } from "node:fs";
import { contentHasOntologyTypes } from "./load";
import { discoverActiveMemberScopes } from "./discover-member-scopes";

let cachedScopes: {
  contentDir: string;
  ontologyMtimeMs: number;
  scopes: MemberScope[];
} | null = null;

export function invalidateMemberScopesCache(): void {
  cachedScopes = null;
}

function ontologyFileMtimeMs(contentDir: string): number {
  const path = ontologyFilePath(contentDir);
  if (existsSync(path)) return statSync(path).mtimeMs;
  return 0;
}

/** Active member-scope instances for a corpus (mtime-cached; invalidate on graph edits). */
export function loadMemberScopesFromContent(contentDir: string): MemberScope[] {
  if (!contentHasOntologyTypes(contentDir)) return [];

  const ontologyMtimeMs = ontologyFileMtimeMs(contentDir);
  if (
    cachedScopes &&
    cachedScopes.contentDir === contentDir &&
    cachedScopes.ontologyMtimeMs === ontologyMtimeMs
  ) {
    return cachedScopes.scopes;
  }

  const scopes = discoverActiveMemberScopes(contentDir);
  cachedScopes = { contentDir, ontologyMtimeMs, scopes };
  return scopes;
}
