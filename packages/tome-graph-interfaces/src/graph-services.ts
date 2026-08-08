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
import type { NodeSummary } from "./queries";
import type {
  LinkOutgoingRelationshipError,
  MoveRelationshipConnectionError,
  UnlinkOutgoingRelationshipError,
} from "./relationship-link-mutations";
import type { RelationshipPropertyUpdateError } from "./relationship-property-update";
import type { SchemaFile } from "./schema";
import type { ReorderDatabaseMembersParams } from "./table-presentation";
import type { TableRowsQuery } from "./table-rows-window";
import type {
  ViewDefinition,
  ViewSortSpec,
} from "./views";
import type { QuickLinkError, WorkspaceFile } from "./workspace";

export type WorkspacePublic = WorkspaceFile & { archiveNodeTitle?: string };

export interface TomeGraphServices {
  getWorkspace(): WorkspacePublic;
  getHomeId(): string;
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
  ): DatabaseViewDetail | null;
  getRelationTable(
    nodeId: string,
    perspective: string,
    rows?: TableRowsQuery,
  ): RelationTableSection | null;
  getNodeViews(nodeId: string): ViewDefinition[];
  createRelationshipView(
    nodeId: string,
    association: string,
    input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
  ): ViewDefinition;
  updateRelationshipView(
    nodeId: string,
    association: string,
    viewId: string,
    input: { name?: string; sorts?: ViewSortSpec[]; properties?: string[] },
  ): ViewDefinition;
  deleteRelationshipView(nodeId: string, association: string, viewId: string): void;
  patchRelationshipViews(
    nodeId: string,
    association: string,
    input: { viewOrder?: string[]; properties?: string[] },
  ): { views?: ViewDefinition[]; properties?: string[] };
  deleteDatabaseColumn(
    databaseId: string,
    columnKey: string,
  ): DeleteDatabaseColumnResult | DeleteDatabaseColumnError;
  createDatabaseColumn(
    databaseId: string,
    input: CreateDatabaseColumnInput,
  ): DatabaseColumnMutationResult | DatabaseColumnMutationError;
  updateDatabaseColumn(
    databaseId: string,
    columnKey: string,
    input: UpdateDatabaseColumnInput,
  ): DatabaseColumnMutationResult | DatabaseColumnMutationError;
  listTypeTables(): { id: string; title: string }[];
  getSchema(): SchemaFile;
  listRelationshipTypes(): string[];
  getRelationshipLinkOptions(
    sourceId: string,
    type: string,
  ): { allowedTargetTypeIds: string[] | null };
  reorderDatabaseMembers(
    databaseId: string,
    params: ReorderDatabaseMembersParams,
  ): DatabaseViewDetail | null;
  search(
    query: string,
    limit?: number,
    allowedTypeIds?: string[],
    options?: { includeBody?: boolean },
  ): NodeSummary[];
  listRecent(limit?: number): NodeSummary[];
  saveDocument(id: string, document: NodeBodyDocument): boolean;
  saveTitle(id: string, title: string): boolean;
  updateDatabaseRowProperty(
    databaseId: string,
    nodeId: string,
    propertyKey: string,
    value: string | null,
  ): RelationshipPropertyUpdateError | null;
  updateOutgoingRelationshipProperty(
    nodeId: string,
    type: string,
    targetId: string,
    propertyKey: string,
    value: string | null,
  ): RelationshipPropertyUpdateError | null;
  deleteNode(id: string): NodeLifecycleError | null;
  archiveNode(id: string): NodeLifecycleError | null;
  unarchiveNode(id: string): NodeLifecycleError | null;
  addQuickLink(
    id: string,
    options?: { label?: string; icon?: string },
  ): QuickLinkError | null;
  removeQuickLink(id: string): QuickLinkError | null;
  reorderQuickLinks(nodeIds: readonly string[]): QuickLinkError | null;
  createNode(input: CreateNodeInput): CreateNodeResult | CreateNodeError;
  createRelationRow(
    sourceId: string,
    input: { type: string; title: string; properties?: Record<string, string> },
  ): CreateNodeResult | CreateNodeError;
  linkOutgoingRelationship(
    sourceId: string,
    input: { type: string; targetId: string },
  ): LinkOutgoingRelationshipError | null;
  unlinkOutgoingRelationship(
    sourceId: string,
    type: string,
    targetId: string,
  ): UnlinkOutgoingRelationshipError | null;
  moveRelationshipConnection(input: {
    type: string;
    oldSourceId: string;
    oldTargetId: string;
    newSourceId: string;
    newTargetId: string;
  }): MoveRelationshipConnectionError | null;
  getGraphFull(): GraphSnapshot;
  getGraphExplorerLod(options?: {
    anchorId?: string;
    layerCount?: number;
  }): GraphLodSnapshot;
  getExtensionsManifest(): Promise<PublicExtensionsManifest>;
  prepareEditorBody(nodeId: string, markdown: string): Promise<string | null>;
  invokeExtension(
    componentId: string,
    input: unknown,
    nodeId?: string,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  bundleEditorExtension(extensionId: string): Promise<string | null>;
  close(): void;
}
