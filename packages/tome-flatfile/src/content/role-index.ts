import {
  bridgeRoleIdsForType,
  type RelationshipTypeDefinition,
  type RelationshipTypesFile,
  type RoleIdPair,
} from "./relationship-types-file";

/** Resolved relational role → relationship type + endpoint index. */
export interface RoleResolution {
  relationshipTypeId: string;
  endpoint: 0 | 1;
}

export type RoleIndex = ReadonlyMap<string, RoleResolution>;

function roleIdsOf(typeId: string, def: RelationshipTypeDefinition): RoleIdPair {
  if (def.roleIds?.[0] && def.roleIds?.[1]) {
    return [def.roleIds[0], def.roleIds[1]];
  }
  return bridgeRoleIdsForType(typeId);
}

/**
 * Build a global index of relational role ULIDs from a relationship-types file.
 * Role ids must be unique across the corpus.
 */
export function buildRoleIndex(file: RelationshipTypesFile): RoleIndex {
  const map = new Map<string, RoleResolution>();
  for (const [rawTypeId, def] of Object.entries(file.relationshipTypes)) {
    const relationshipTypeId = rawTypeId.trim();
    const roleIds = roleIdsOf(relationshipTypeId, def);
    indexRole(map, roleIds[0], relationshipTypeId, 0);
    indexRole(map, roleIds[1], relationshipTypeId, 1);
  }
  return map;
}

function indexRole(
  map: Map<string, RoleResolution>,
  roleId: string,
  relationshipTypeId: string,
  endpoint: 0 | 1,
): void {
  const id = roleId.trim();
  const existing = map.get(id);
  if (existing) {
    throw new Error(
      `Duplicate relational role id "${id}" (used by ${existing.relationshipTypeId}:${existing.endpoint} and ${relationshipTypeId}:${endpoint})`,
    );
  }
  map.set(id, { relationshipTypeId, endpoint });
}

export function resolveRole(index: RoleIndex, roleId: string): RoleResolution | undefined {
  return index.get(roleId.trim());
}

export function roleIdsForRelationshipType(
  def: RelationshipTypeDefinition,
  relationshipTypeId?: string,
): RoleIdPair {
  if (def.roleIds?.[0] && def.roleIds?.[1]) {
    return [def.roleIds[0], def.roleIds[1]];
  }
  if (!relationshipTypeId) {
    throw new Error("roleIdsForRelationshipType: missing roleIds and relationshipTypeId for bridge");
  }
  return bridgeRoleIdsForType(relationshipTypeId);
}
