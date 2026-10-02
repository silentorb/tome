import type {
  CreateDatabaseColumnInput,
  DatabaseColumnMutationError,
  DatabaseColumnMutationResult,
  UpdateDatabaseColumnInput,
} from "./database-column-mutations";
import type { DatabaseViewDetail } from "./database-view";
import type {
  DeleteDatabaseColumnError,
  DeleteDatabaseColumnResult,
} from "./delete-database-column";
import type { PublicExtensionsManifest } from "./extensions";
import type { GraphLodSnapshot, GraphSnapshot } from "./graph-export";
import type {
  CreateNodeError,
  CreateNodeInput,
  CreateNodeResult,
} from "./node-create";
import type { NodeLifecycleError } from "./node-lifecycle";
import type { NodeBodyDocument } from "./node-body-document";
import type { EditorNodePageDetail, RelationTableSection } from "./node-page-sections";
import type { NodeSummary, SearchNodesOptions } from "./queries";
import type {
  LinkOutgoingRelationshipError,
  MoveRelationshipConnectionError,
  UnlinkOutgoingRelationshipError,
} from "./relationship-link-mutations";
import type { RelationshipPropertyUpdateError } from "./relationship-property-update";
import type { SchemaFile } from "./schema";
import type { RewriteDatabaseSequenceParams } from "./table-presentation";
import type { TableRowsQuery } from "./table-rows-window";
import type {
  ViewDefinition,
  ViewSortSpec,
} from "./views";
import type { QuickLinkError, WorkspaceFile } from "./workspace";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
} from "./graph-store";

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

/** Distinct relationship projection present in data, with its perspective label. */
export interface RelationshipTypeOption {
  /** Directed projection type (`ULID:0` / `ULID:1`) used when linking. */
  type: string;
  /** User-facing perspective title (e.g. Features). */
  label: string;
}

export interface TomeCorpusPublic {
  id: string;
  access: "readwrite" | "readonly";
  label: string;
  homeNodeId: string;
  archiveNodeId: string;
  workspace: WorkspacePublic;
}

export type DocumentIconResult =
  | { ok: true; body: Uint8Array; contentType: string }
  | { ok: false; error: "not_found" | "bad_path" | "bad_type" };

export interface TomeGraphServices {
  getWorkspace(corpus?: string): Promise<WorkspacePublic>;
  listCorpora(): Promise<TomeCorpusPublic[]>;
  /** Bytes for `branding.documentIconImage` of the given (or default) corpus. */
  getDocumentIcon(corpus?: string): Promise<DocumentIconResult>;
  getHomeId(corpus?: string): Promise<string>;
  getNode(
    id: string,
    options?: {
      tabId?: string;
      databaseView?: string;
      scopeId?: string;
      rows?: TableRowsQuery;
    },
  ): Promise<EditorNodePageDetail | null>;
  getDatabaseView(
    id: string,
    tabId?: string,
    rows?: TableRowsQuery,
  ): Promise<DatabaseViewDetail | null>;
  getRelationTable(
    nodeId: string,
    perspective: string,
    rows?: TableRowsQuery,
  ): Promise<RelationTableSection | null>;
  getNodeViews(nodeId: string): Promise<ViewDefinition[]>;
  createRelationshipView(
    nodeId: string,
    relationshipTypeId: string,
    input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
  ): Promise<ViewDefinition>;
  updateRelationshipView(
    nodeId: string,
    relationshipTypeId: string,
    viewId: string,
    input: { name?: string; sorts?: ViewSortSpec[]; properties?: string[] },
  ): Promise<ViewDefinition>;
  deleteRelationshipView(nodeId: string, relationshipTypeId: string, viewId: string): Promise<void>;
  patchRelationshipViews(
    nodeId: string,
    relationshipTypeId: string,
    input: { viewOrder?: string[]; properties?: string[] },
  ): Promise<{ views?: ViewDefinition[]; properties?: string[] }>;
  deleteDatabaseColumn(
    databaseId: string,
    columnKey: string,
  ): Promise<DeleteDatabaseColumnResult | DeleteDatabaseColumnError>;
  createDatabaseColumn(
    databaseId: string,
    input: CreateDatabaseColumnInput,
  ): Promise<DatabaseColumnMutationResult | DatabaseColumnMutationError>;
  updateDatabaseColumn(
    databaseId: string,
    columnKey: string,
    input: UpdateDatabaseColumnInput,
  ): Promise<DatabaseColumnMutationResult | DatabaseColumnMutationError>;
  listTypeTables(): Promise<{ id: string; title: string }[]>;
  getSchema(): Promise<SchemaFile>;
  listRelationshipTypes(): Promise<RelationshipTypeOption[]>;
  getRelationshipLinkOptions(
    sourceId: string,
    type: string,
  ): Promise<{ allowedTargetTypeIds: string[] | null }>;
  rewriteDatabaseSequence(
    databaseId: string,
    params: RewriteDatabaseSequenceParams,
  ): Promise<DatabaseViewDetail | null>;
  search(
    query: string,
    limit?: number,
    allowedTypeIds?: string[],
    options?: SearchNodesOptions,
  ): Promise<NodeSummary[]>;
  /**
   * Whether a searcher is bound for the given role (default `content`).
   * Non-empty queries for that role are supported when true.
   */
  isSearchAvailable(role?: "title" | "content"): Promise<boolean>;
  listRecent(limit?: number): Promise<NodeSummary[]>;
  saveDocument(id: string, document: NodeBodyDocument): Promise<boolean>;
  saveTitle(id: string, title: string): Promise<boolean>;
  updateDatabaseRowProperty(
    databaseId: string,
    nodeId: string,
    propertyKey: string,
    value: string | null,
  ): Promise<RelationshipPropertyUpdateError | null>;
  updateOutgoingRelationshipProperty(
    nodeId: string,
    type: string,
    targetId: string,
    propertyKey: string,
    value: string | null,
  ): Promise<RelationshipPropertyUpdateError | null>;
  deleteNode(id: string): Promise<NodeLifecycleError | null>;
  archiveNode(id: string): Promise<NodeLifecycleError | null>;
  unarchiveNode(id: string): Promise<NodeLifecycleError | null>;
  addQuickLink(
    id: string,
    options?: { label?: string },
  ): Promise<QuickLinkError | null>;
  removeQuickLink(id: string): Promise<QuickLinkError | null>;
  reorderQuickLinks(nodeIds: readonly string[]): Promise<QuickLinkError | null>;
  createNode(input: CreateNodeInput): Promise<CreateNodeResult | CreateNodeError>;
  createRelationRow(
    sourceId: string,
    input: { type: string; title: string; properties?: Record<string, string> },
  ): Promise<CreateNodeResult | CreateNodeError>;
  linkOutgoingRelationship(
    sourceId: string,
    input: { type: string; targetId: string },
  ): Promise<LinkOutgoingRelationshipError | null>;
  unlinkOutgoingRelationship(
    sourceId: string,
    type: string,
    targetId: string,
  ): Promise<UnlinkOutgoingRelationshipError | null>;
  moveRelationshipConnection(input: {
    type: string;
    oldSourceId: string;
    oldTargetId: string;
    newSourceId: string;
    newTargetId: string;
  }): Promise<MoveRelationshipConnectionError | null>;
  getGraphFull(): Promise<GraphSnapshot>;
  getGraphExplorerLod(options?: {
    anchorId?: string;
    layerCount?: number;
  }): Promise<GraphLodSnapshot>;
  /** Integrator escape hatch — run read-only Imp graphs against the host graph store. */
  executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): Promise<ImpCollectionResult>;
  getExtensionsManifest(): Promise<PublicExtensionsManifest>;
  prepareEditorBody(nodeId: string, markdown: string): Promise<string | null>;
  invokeExtension(
    componentId: string,
    input: unknown,
    nodeId?: string,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  bundleEditorExtension(extensionId: string): Promise<string | null>;
  close(): Promise<void>;
}
