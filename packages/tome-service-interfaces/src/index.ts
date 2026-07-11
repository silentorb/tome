import type { TomeGraphServices } from "tome-graph-interfaces";

/** Per-entry options from `tome-server.json` (module-specific). */
export type TomeServiceModuleOptions = unknown;

/**
 * Host context passed into a service module when the server starts it.
 * `services` is the domain facade (`TomeGraphServices`), not a service module.
 */
export interface TomeServiceHost {
  services: TomeGraphServices;
  options: TomeServiceModuleOptions;
}

/**
 * A service module the host starts (HTTP today; others later).
 * Must not encode URL paths or HTTP verbs in this package.
 */
export interface TomeServiceModule {
  readonly id: string;
  start(host: TomeServiceHost): void | Promise<void>;
  stop?(): void | Promise<void>;
}

/** Factory shape expected by `tome-server.json` `export` field. */
export type TomeServiceModuleFactory = () => TomeServiceModule;

/** One entry in `tome-server.json` `services` array. */
export interface TomeServerServiceConfigEntry {
  id: string;
  module: string;
  export: string;
  options?: TomeServiceModuleOptions;
}

export interface TomeServerConfig {
  version: number;
  services: TomeServerServiceConfigEntry[];
}
