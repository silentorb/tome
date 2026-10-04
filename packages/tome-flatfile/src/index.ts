export { ContentStore, DEFAULT_CORPUS_ID } from "./content/store";
export {
  CompositeStore,
  CorpusReadonlyError,
  CorpusConflictError,
} from "./content/composite-store";
export { createFlatfileModule } from "./module";
export {
  FlatfileGraphStore,
  openFlatfileGraphStore,
} from "./graph-store";
export type { FlatfileStoreBackend } from "./graph-store";
export {
  expandAllRelationships,
  expandRelationshipEntry,
  toDomainRelationship,
} from "./relationship-expand";
export type {
  RelationshipRecordRow,
  RelationshipProjectionRow,
} from "./relationship-expand";
export { relationshipId } from "./relationship-id";
export { collectSetNodeIds } from "./set-nodes";
export { LinkResolutionError, resolveRelationshipTypeIdForLink } from "./content/resolve-composite-for-link";

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
  RELATIONSHIP_TYPES_FILE_VERSION,
  UnknownRelationshipTypeError,
  emptyRelationshipTypesFile,
  generateRelationshipTypeId,
  isRelationshipTypeId,
  normalizeRelationshipTypeId,
  parseRelationshipTypesFile,
  parseProjectionType,
  relationshipTypeIdFromProjectionType,
  endpointIndexFromProjectionType,
  projectionTypeForEndpoint,
  oppositeProjectionType,
  onlyActiveHostProjectionType,
  projectionTypesForComposite,
  perspectiveTitle,
  perspectiveLinkAdd,
  perspectiveLinkExisting,
  perspectiveConfigAt,
  registerBidirectionalType,
  registerSetRelationshipType,
  registerTypeDefinition,
  requireRelationshipTypeId,
  serializeRelationshipTypesFile,
  isBidirectionalComposite,
  isDualPerspectiveType,
  perspectiveCountForExpansion,
} from "./content/relationship-types-file";
export type {
  RelationshipTypeDefinition,
  RelationshipTypesFile,
  PerspectiveLabelConfig,
  PerspectivePair,
  TraitEntry,
  TraitObjectEntry,
  RelationshipTypeEndpoints,
  RelationshipTypeEndpointConstraint,
} from "./content/relationship-types-file";

export {
  DYNAMIC_PROPERTIES_FILE_VERSION,
  columnSetRecordFromEntry,
  emptyDynamicPropertiesFile,
  entryFromSeedColumnSet,
  entryFromSeedProperty,
  propertyRecordFromEntry,
  fileFromSeedInputs,
  parseDynamicPropertiesFile,
  serializeDynamicPropertiesFile,
} from "./content/dynamic-properties-file";
export type {
  DynamicColumnSetFileEntry,
  DynamicColumnSetRecord,
  DynamicPropertyFileEntry,
  DynamicPropertyRecord,
  DynamicPropertiesFile,
  SeedDynamicColumnSetInput,
  SeedDynamicPropertyInput,
} from "./content/dynamic-properties-file";

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
  DYNAMIC_PROPERTIES_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  SEQUENCING_FILENAME,
  EXTENSIONS_FILENAME,
  REDIRECTS_FILENAME,
  ONTOLOGY_FILENAME,
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
  relationshipTypesFilePath,
  defaultDbPathForContent,
  DEFAULT_DB_FILENAME,
  readEnv,
  dynamicPropertiesFilePath,
  schemaFilePath,
  viewsFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
  sequencingFilePath,
  extensionsFilePath,
  redirectsFilePath,
  ontologyFilePath,
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
  DYNAMIC_TITLE_EDITOR_QUERY_PARAM,
  DYNAMIC_TITLE_EDITOR_QUERY_VALUE,
} from "./dynamic-node-links";
export {
  DEFAULT_CALLOUT_EMOJI,
  DEFAULT_CALLOUT_PREFIX,
  extractLeadingCalloutEmoji,
  hasLeadingCalloutEmoji,
} from "./callout";
export {
  extractLeadingTaskMarker,
  hasLeadingTaskMarker,
  taskMarkerPrefix,
} from "./task";
export type { TaskMarker } from "./task";
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
  ONTOLOGY_FILE_VERSION,
  emptyOntologyFile,
  parseOntologyFile,
  serializeOntologyFile,
  ontologyTypesConfigured,
} from "./ontology/ontology-file";
export type { OntologyFile, OntologyTypeKey } from "./ontology/ontology-file";
export {
  loadOntologyFileFromContent,
  invalidateOntologyCache,
  contentHasOntologyTypes,
} from "./ontology/load";
export { parseImpGraph } from "./ontology/imp-graph";
export {
  discoverActiveNodePredicates,
  compileDiscoveredNodePredicates,
} from "./ontology/discover";
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
  resolvePageBlockRole,
  resolveSearchRoleMap,
  findComponentById,
  findSearcherById,
} from "./extensions";
export type {
  ExtensionComponentEntry,
  ExtensionComponentKind,
  ExtensionEntry,
  ExtensionsFile,
  ExtensionsManifest,
  ExtensionsSearchRoleMap,
  ResolvedExtensionComponent,
  ResolvedSearcherComponent,
} from "./extensions";

export {
  REDIRECTS_FILE_VERSION,
  emptyRedirectsFile,
  normalizeRedirectPath,
  parseRedirectsFile,
  serializeRedirectsFile,
  invalidateRedirectsCache,
  loadRedirectsFromContent,
} from "./redirects";
export type { RedirectsFile } from "./redirects";

export {
  SET_TRAIT,
  ORDERED_TRAIT,
  SYMMETRIC_TRAIT,
  ORDERED_PROPERTY_DEFAULT,
  relationshipTypeIdFromTypeOrProjection,
  childNodeId,
  hasTrait,
  isMemberSideProjectionType,
  isOrderedTraitComposite,
  isOrderedSetRelationshipType,
  isOrderedSetProjectionType,
  isSetSideProjectionType,
  isSetTraitComposite,
  isSetTraitEntry,
  isSetTraitProjectionType,
  isSetTraitType,
  isSymmetricRelationshipType,
  isSymmetricComposite,
  memberSideProjectionType,
  memberSideProjectionTypes,
  orderedPropertyName,
  parentNodeId,
  setRoleRelationshipTypeForNode,
  setRoleIndices,
  setRoleProjectionTypesForComposite,
  setRoleProjectionTypesForNode,
  setSideProjectionType,
  setSideProjectionTypes,
  setTraitRelationshipTypeIds,
  setTraitProjectionTypes,
  traitConfig,
  traitMap,
  typesWithTrait,
} from "./relationship-type-traits";

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

export type {
  RelationGroupsLayerConfig,
  RelationScopeLayerConfig,
  SequenceLayerConfig,
  TablePresentationLayers,
  TablePresentationComposition,
} from "tome-graph-interfaces";
export { parsePresentationLayers } from "./content/presentation-layers";

export {
  emptySequencingFile,
  parseSequencingFile,
  serializeSequencingFile,
  SEQUENCING_FILE_VERSION,
} from "./sequencing/sequencing-file";
export type {
  SequencingFile,
  SequencingTableConfig,
} from "./sequencing/sequencing-file";
export {
  loadSequencingFromContent,
  invalidateSequencingCache,
} from "./sequencing/load";

export {
  loadRelationshipTypesFromContent,
  loadRelationshipRuntimeFromContent,
  invalidateRelationshipTypesCache,
} from "./relationship-types/load";
export {
  loadTableSchemasFromContent,
  hasTableSchemaEntry,
  invalidateTableSchemasCache,
} from "./table-schemas/load";
export { loadViewsFromContent, invalidateViewsCache } from "./views/load";

export {
  hostEndpointIndex,
  uniqueHostEndpointIndex,
  projectionTypeForHostTable,
  targetTypeIdForHostTable,
  allowedTargetTypeIdsForEndpoint,
  relationshipTypeRulesFromRegistry,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
} from "./relationship-type-endpoints";
