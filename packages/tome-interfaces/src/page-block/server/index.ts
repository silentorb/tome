import type { PageBlockComponentRef } from "../types";

/** Opaque host services (graph access, etc.) — implemented by the editor API host. */
export interface ServerHostServices {
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
