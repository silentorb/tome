export { ContentStore } from "./content/store";
export { createFlatfileModule } from "./module";
export { relationshipId } from "./relationship-id";
export { collectSetNodeIds } from "./set-nodes";
export { LinkResolutionError, resolveAssociationIdForLink } from "./content/resolve-composite-for-link";

export {
  RELATIONSHIPS_FILE_VERSION,
  relationshipFromEntry,
  entryFromRelationship,
  parseRelationshipEntry,
  serializeRelationshipEntry,
  parseLegacyRelationshipsFile,
  parseRelationshipsFile,
  serializeRelationshipsFile,
  relationshipRecordId,
  connectsEndpoints,
} from "./content/relationships-file";
export type { RelationshipEntry, RelationshipsFile } from "./content/relationships-file";
export {
  relationshipDigest,
  relationshipShardDir,
  relationshipRelativePath,
} from "./content/relationship-path";
export { ulidToBytes, relationshipKeyBytes } from "./content/ulid-bytes";

export {
  ASSOCIATIONS_FILE_VERSION,
  UnknownAssociationError,
  emptyAssociationsFile,
  generateAssociationId,
  isAssociationId,
  normalizeAssociationId,
  parseAssociationsFile,
  parseProjectionType,
  associationIdFromProjectionType,
  endpointIndexFromProjectionType,
  projectionTypeForEndpoint,
  projectionTypesForComposite,
  perspectiveTitle,
  perspectiveLinkAdd,
  perspectiveLinkExisting,
  perspectiveConfigAt,
  registerBidirectionalType,
  registerSetAssociation,
  registerTypeDefinition,
  requireAssociationId,
  serializeAssociationsFile,
  isBidirectionalComposite,
  isDualPerspectiveType,
  perspectiveCountForExpansion,
} from "./content/associations-file";
export type {
  AssociationDefinition,
  AssociationsFile,
  PerspectiveLabelConfig,
  PerspectivePair,
  TraitEntry,
  TraitObjectEntry,
  AssociationEndpoints,
  AssociationEndpointConstraint,
} from "./content/associations-file";

export {
  DYNAMIC_FIELDS_FILE_VERSION,
  columnSetRecordFromEntry,
  emptyDynamicFieldsFile,
  entryFromSeedColumnSet,
  entryFromSeedField,
  fieldRecordFromEntry,
  fileFromSeedInputs,
  parseDynamicFieldsFile,
  serializeDynamicFieldsFile,
} from "./content/dynamic-fields-file";
export type {
  DynamicColumnSetFileEntry,
  DynamicColumnSetRecord,
  DynamicFieldFileEntry,
  DynamicFieldRecord,
  DynamicFieldsFile,
  SeedDynamicColumnSetInput,
  SeedDynamicFieldInput,
} from "./content/dynamic-fields-file";

export {
  bodyFromNode,
  nodeFromFile,
  parseNodeFile,
  serializeNodeFile,
} from "./content/node-file";
export type { ParsedNodeFile } from "./content/node-file";

export {
  CONTENT_DATA_SUBDIR,
  CONTENT_ARCHIVE_SUBDIR,
  CONTENT_MODEL_SUBDIR,
  CONTENT_NODES_SUBDIR,
  CONTENT_RELATIONSHIPS_SUBDIR,
  RELATIONSHIPS_SYNC_MARKER,
  RELATIONSHIPS_FILENAME,
  ASSOCIATIONS_FILENAME,
  DYNAMIC_FIELDS_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  ORDERED_COLLECTIONS_FILENAME,
  EXTENSIONS_FILENAME,
  NODE_FILE_PATTERN,
  NODE_ID_PATTERN,
  RELATIONSHIP_FILE_PATTERN,
  contentDataDir,
  contentArchiveDir,
  contentModelDir,
  contentNodesDir,
  contentNodesArchiveDir,
  contentRelationshipsDir,
  contentRelationshipsArchiveDir,
  relationshipsFilePath,
  relationshipFilePath,
  associationsFilePath,
  defaultDbPathForContent,
  DEFAULT_DB_FILENAME,
  readEnv,
  dynamicFieldsFilePath,
  schemaFilePath,
  viewsFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
  orderedCollectionsFilePath,
  extensionsFilePath,
  isNodeId,
  nodeFileName,
  nodeFilePath,
  nodeRelativePath,
  nodeShardDir,
  resolveContentPath,
} from "./content/paths";

export {
  emptyViewsFile,
  parseViewsFile,
  serializeViewsFile,
  slugifyTabId,
  uniqueTabId,
  VIEWS_FILE_VERSION,
  isGeneratedViewRecord,
  isViewDefinition,
  DEFAULT_CUSTOM_TAB,
  DEFAULT_VIEW,
} from "./content/views-file";
export type {
  CustomTabDefinition,
  GeneratedViewRecord,
  ViewDefinition,
  ViewProperties,
  ViewSortDirection,
  ViewSortSpec,
  ViewRecord,
  ViewsFile,
} from "./content/views-file";

export {
  emptyTableSchemasFile,
  parseTableSchemasFile,
  serializeTableSchemasFile,
} from "./content/table-schemas-file";
export type { TableColumnDef, TableSchemasFile } from "./content/table-schemas-file";

export {
  NODE_ID_RE_SRC,
  generateNodeId,
} from "./node-id";
export {
  expandMarkdownBodyLinks,
  resolveMarkdownHrefTarget,
  TOME_LINK_SCHEME,
} from "./markdown-links";
export {
  DYNAMIC_NODE_EDITOR_QUERY_PARAM,
  DYNAMIC_NODE_LINK_QUERY_PARAM,
  DYNAMIC_NODE_LINK_QUERY_VALUE,
} from "./dynamic-node-links";
export {
  DEFAULT_CALLOUT_EMOJI,
  DEFAULT_CALLOUT_PREFIX,
  extractLeadingCalloutEmoji,
  hasLeadingCalloutEmoji,
} from "./callout";
export { relationType, normalizeRelationshipType, stripEmojis } from "./relation-type";

export {
  emptySchemaFile,
  parseSchemaFile,
  serializeSchemaFile,
  SCHEMA_FILE_VERSION,
} from "./schema-rules/schema-file";
export type {
  EnumDefinition,
  RelationshipRuleEntry,
  SchemaFile,
} from "./schema-rules/schema-file";
export {
  loadSchemaFromContent,
  loadWorkspaceSchema,
  invalidateSchemaCache,
} from "./schema-rules/load";

export {
  emptyWorkspaceFile,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  WORKSPACE_FILE_VERSION,
  editorMarkdownBodyPanel,
  spatialGraphNodeDimensionScale,
  schemaDiagramMemberBadgePosition,
  schemaDiagramPageBlockServices,
} from "./workspace/workspace-file";
export type {
  WorkspaceFile,
  WorkspaceBranding,
  WorkspaceLegacy,
  WorkspaceGraphExplorer,
  WorkspaceStaticSite,
  WorkspaceEditor,
  WorkspaceSpatialGraph,
  WorkspaceSchemaDiagram,
  WorkspaceSchemaDiagramMemberBadgePosition,
  WorkspaceQuickLink,
  SidebarLink,
} from "./workspace/workspace-file";
export {
  loadWorkspaceFromContent,
  loadWorkspace,
  invalidateWorkspaceCache,
} from "./workspace/load";
export {
  resolveWorkspace,
  archiveNodeId,
  protectedNodeIds,
  legacyArchivePathPrefix,
  legacyExportPathPrefix,
} from "./workspace/resolve";

export {
  EXTENSIONS_FILE_VERSION,
  emptyExtensionsFile,
  parseExtensionsFile,
  serializeExtensionsFile,
  invalidateExtensionsCache,
  loadExtensionsFromContent,
  resolveExtensionsManifest,
  findComponentById,
} from "./extensions";
export type {
  ExtensionComponentEntry,
  ExtensionComponentKind,
  ExtensionEntry,
  ExtensionsFile,
  ExtensionsManifest,
  ResolvedExtensionComponent,
} from "./extensions";

export {
  SET_TRAIT,
  ORDERED_TRAIT,
  ORDERED_PROPERTY_DEFAULT,
  associationIdFromTypeOrProjection,
  childNodeId,
  hasTrait,
  isMemberSideProjectionType,
  isOrderedTraitComposite,
  isOrderedSetAssociation,
  isOrderedSetProjectionType,
  isSetSideProjectionType,
  isSetTraitComposite,
  isSetTraitEntry,
  isSetTraitProjectionType,
  isSetTraitType,
  memberSideProjectionType,
  memberSideProjectionTypes,
  orderedPropertyName,
  parentNodeId,
  setRoleAssociationForNode,
  setRoleIndices,
  setRoleProjectionTypesForComposite,
  setRoleProjectionTypesForNode,
  setSideProjectionType,
  setSideProjectionTypes,
  setTraitAssociationIds,
  setTraitProjectionTypes,
  traitConfig,
  traitMap,
  typesWithTrait,
} from "./association-traits";

export {
  FALLBACK_PRIORITY,
  isPriorityColumnKey,
  isPriorityPropertyName,
  PRIORITY_ENUM_ID,
  resolvePriorityEnum,
  resolvePropertyEnum,
  type PriorityValue,
} from "./property-enums-core";

export {
  STORED_SCALAR_COLUMN_TYPES,
  slugifyPropertyKey,
  isStoredScalarColumnType,
  getTableSchema,
  findColumnByKey,
  storedScalarColumns,
  relationColumns,
} from "./table-schema";

export {
  projectionTypeForRelationColumn,
  relationColumnCompositeType,
  targetTypeIdForRelationColumn,
} from "./table-relation-column";

export {
  emptyOrderedCollectionsFile,
  parseOrderedCollectionsFile,
  serializeOrderedCollectionsFile,
  ORDERED_COLLECTIONS_FILE_VERSION,
} from "./ordered-collections-config/ordered-collections-file";
export {
  loadOrderedCollectionsFromContent,
  invalidateOrderedCollectionsCache,
} from "./ordered-collections-config/load";

export {
  loadAssociationsFromContent,
  invalidateAssociationsCache,
} from "./associations/load";
export {
  loadTableSchemasFromContent,
  hasTableSchemaEntry,
  invalidateTableSchemasCache,
} from "./table-schemas/load";
export { loadViewsFromContent, invalidateViewsCache } from "./views/load";

export {
  hostEndpointIndex,
  projectionTypeForHostTable,
  targetTypeIdForHostTable,
  allowedTargetTypeIdsForEndpoint,
  associationRulesFromRegistry,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
} from "./association-endpoints";
