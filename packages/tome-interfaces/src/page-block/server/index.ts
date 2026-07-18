import type { ExtensionGraphQueryServices } from "../../extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "../../extension-services/schema-query";
import type { ExtensionSqlQueryServices } from "../../extension-services/sql-query";
import type { PageBlockComponentRef } from "../types";

/** Opaque host services (graph access, etc.) — implemented by the editor API host. */
export interface ServerHostServices {
  graphQuery?: ExtensionGraphQueryServices;
  schemaQuery?: ExtensionSchemaQueryServices;
  sqlQuery?: ExtensionSqlQueryServices;
  invokeExtensionRoute?(componentId: string, input: unknown): Promise<unknown>;
}

export interface ServerPageBlockContext {
  component: PageBlockComponentRef;
  nodeId?: string;
  services: ServerHostServices;
}

export interface ServerPageBlockHandler {
  implementationId: string;
  invoke(ctx: ServerPageBlockContext, input: unknown): Promise<unknown>;
}

export interface ServerPageBlockHost {
  registerPageBlockHandler(handler: ServerPageBlockHandler): void;
}

export type ServerPageBlockModule = {
  register(host: ServerPageBlockHost): void;
};
