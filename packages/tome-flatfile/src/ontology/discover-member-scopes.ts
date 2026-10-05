import {
  MEMBER_SCOPE_BLOCK_ROLE,
  extractStructuredProperties,
} from "tome-interfaces/page-block";
import type { MemberScope } from "tome-ontology";
import { ContentStore } from "../content/store";
import { bodyFromNode } from "../content/node-file";
import { isNodeId } from "../node-id";
import { loadOntologyFileFromContent } from "./load";
import {
  activeOntologyMemberIds,
  loadAssociationsRegistry,
  setMembersFromEntries,
} from "./discover-shared";

const MEMBER_SCOPE_PROPERTY_KEY = "memberScope";

function parseMemberScopePayload(data: unknown): {
  typeTableId: string;
  predicateId: string;
} | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const typeTableId = obj.typeTableId;
  const predicateId = obj.predicateId;
  if (typeof typeTableId !== "string" || !isNodeId(typeTableId.trim())) return null;
  if (typeof predicateId !== "string" || !isNodeId(predicateId.trim())) return null;
  return { typeTableId: typeTableId.trim(), predicateId: predicateId.trim() };
}

function memberScopeFromBody(body: string): {
  typeTableId: string;
  predicateId: string;
} | null {
  const props = extractStructuredProperties(body, MEMBER_SCOPE_BLOCK_ROLE);
  const payload = props.get(MEMBER_SCOPE_PROPERTY_KEY);
  if (!payload) return null;
  return parseMemberScopePayload(payload.data);
}

/**
 * Discover active member-scope instances:
 * members of types.memberScope that are also members of ≥1 ontology instance,
 * with a valid `{#memberScope type="member-scope"}` binding payload.
 */
export function discoverActiveMemberScopes(contentDir: string): MemberScope[] {
  const ontology = loadOntologyFileFromContent(contentDir);
  const ontologyTypeId = ontology.types.ontology;
  const memberScopeTypeId = ontology.types.memberScope;
  if (!ontologyTypeId || !memberScopeTypeId) return [];

  const store = new ContentStore(contentDir);
  const entries = store.readRelationshipsFile().relationships;
  const registry = loadAssociationsRegistry(contentDir);

  const activeInOntology = activeOntologyMemberIds(ontologyTypeId, entries, registry);
  if (activeInOntology.size === 0) return [];

  const candidates = setMembersFromEntries(memberScopeTypeId, entries, registry);
  const scopes: MemberScope[] = [];
  for (const scopeId of candidates) {
    if (!activeInOntology.has(scopeId)) continue;
    const node = store.readNode(scopeId);
    if (!node) continue;
    const binding = memberScopeFromBody(bodyFromNode(node));
    if (!binding) continue;
    const title =
      typeof node.properties.title === "string" ? node.properties.title : undefined;
    scopes.push({
      id: scopeId,
      typeTableId: binding.typeTableId,
      predicateId: binding.predicateId,
      title,
    });
  }
  return scopes;
}
