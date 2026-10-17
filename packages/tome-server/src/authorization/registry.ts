import {
  resolveBuiltInImpQueryAuthorizer,
  resolveBuiltInModificationAuthorizer,
  type AuthorizationHost,
  type BuiltInAuthorizerId,
  type ImpQueryAuthorizer,
  type ModificationAuthorizer,
} from "tome-interfaces/authorization";
import type { TomeAuthorizationConfig } from "tome-service-interfaces";

/**
 * Holds Imp-query and modification authorizer slots.
 * Starts deny-everything; built-in config and extension registration grant over that baseline.
 */
export class AuthorizationRegistry implements AuthorizationHost {
  #impQuery: ImpQueryAuthorizer = resolveBuiltInImpQueryAuthorizer("deny-everything");
  #modification: ModificationAuthorizer =
    resolveBuiltInModificationAuthorizer("deny-everything");

  getImpQueryAuthorizer(): ImpQueryAuthorizer {
    return this.#impQuery;
  }

  getModificationAuthorizer(): ModificationAuthorizer {
    return this.#modification;
  }

  registerImpQueryAuthorizer(authorizer: ImpQueryAuthorizer): void {
    this.#impQuery = authorizer;
  }

  registerModificationAuthorizer(authorizer: ModificationAuthorizer): void {
    this.#modification = authorizer;
  }

  /** Reset to deny, then apply explicit built-in config (allow only when named). */
  resetAndApplyBuiltIns(config?: TomeAuthorizationConfig | null): void {
    this.#impQuery = resolveBuiltInImpQueryAuthorizer("deny-everything");
    this.#modification = resolveBuiltInModificationAuthorizer("deny-everything");
    if (!config) return;
    if (config.impQueryAuthorizer) {
      this.#impQuery = resolveBuiltInImpQueryAuthorizer(config.impQueryAuthorizer);
    }
    if (config.modificationAuthorizer) {
      this.#modification = resolveBuiltInModificationAuthorizer(
        config.modificationAuthorizer,
      );
    }
  }
}

export function parseBuiltInAuthorizerId(
  value: unknown,
  path: string,
): BuiltInAuthorizerId | undefined {
  if (value === undefined) return undefined;
  if (value !== "deny-everything" && value !== "allow-everything") {
    throw new Error(
      `${path}: must be "deny-everything" or "allow-everything" (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

export function parseAuthorizationConfig(
  raw: unknown,
): TomeAuthorizationConfig | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("tome-server config: authorization must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const config: TomeAuthorizationConfig = {};
  const imp = parseBuiltInAuthorizerId(
    obj.impQueryAuthorizer,
    "authorization.impQueryAuthorizer",
  );
  if (imp) config.impQueryAuthorizer = imp;
  const mod = parseBuiltInAuthorizerId(
    obj.modificationAuthorizer,
    "authorization.modificationAuthorizer",
  );
  if (mod) config.modificationAuthorizer = mod;
  return config;
}

export function resolveAuthorizationBuiltIns(
  config?: TomeAuthorizationConfig | null,
): {
  impQueryAuthorizer: BuiltInAuthorizerId;
  modificationAuthorizer: BuiltInAuthorizerId;
} {
  return {
    impQueryAuthorizer: config?.impQueryAuthorizer ?? "deny-everything",
    modificationAuthorizer: config?.modificationAuthorizer ?? "deny-everything",
  };
}
