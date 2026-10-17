import {
  createAuthorizationModelAuthorizer,
  resolveConstantBuiltInAuthorizer,
  type AuthorizationHost,
  type AuthorizationModelAuthorizerOptions,
  type Authorizer,
  type BuiltInAuthorizerId,
} from "tome-interfaces/authorization";
import type { TomeAuthorizationConfig } from "tome-service-interfaces";

export type AuthorizationRegistryOptions = {
  /**
   * Content roots for authorization-model discovery (ontology.json + set membership).
   * Required when applying implementationId "authorization-model".
   */
  listContentDirs?: () => readonly string[];
  /**
   * Discover Authorization Model instance ids for the given content dirs.
   * Injected so the registry stays free of a hard flatfile import cycle in tests;
   * production wires discoverAuthorizationModelInstanceIds from tome-flatfile.
   */
  discoverAuthorizationModelInstanceIds?: (contentDir: string) => readonly string[];
  /**
   * True when ontology.json declares types.authorizationModel for the content dir.
   */
  contentHasAuthorizationModelType?: (contentDir: string) => boolean;
  /**
   * Phase 3b: Imp→SQL policy evaluator for node-edit modifications.
   * When omitted, authorization-model stays fail-closed (always deny).
   */
  evaluateModification?: AuthorizationModelAuthorizerOptions["evaluateModification"];
};

/**
 * Holds the active denial authorizer.
 * Starts deny-everything; built-in config and extension registration grant over that baseline.
 */
export class AuthorizationRegistry implements AuthorizationHost {
  #authorizer: Authorizer = resolveConstantBuiltInAuthorizer("deny-everything");
  readonly #options: AuthorizationRegistryOptions;

  constructor(options: AuthorizationRegistryOptions = {}) {
    this.#options = options;
  }

  getAuthorizer(): Authorizer {
    return this.#authorizer;
  }

  registerAuthorizer(authorizer: Authorizer): void {
    this.#authorizer = authorizer;
  }

  /** Reset to deny, then apply explicit built-in config (allow / model only when named). */
  resetAndApplyBuiltIns(config?: TomeAuthorizationConfig | null): void {
    const id = config?.implementationId ?? "deny-everything";
    if (id === "allow-everything" || id === "deny-everything") {
      this.#authorizer = resolveConstantBuiltInAuthorizer(id);
      return;
    }
    if (id === "authorization-model") {
      this.#authorizer = this.#createAuthorizationModelAuthorizer();
      return;
    }
    this.#authorizer = resolveConstantBuiltInAuthorizer("deny-everything");
  }

  #createAuthorizationModelAuthorizer(): Authorizer {
    const listContentDirs = this.#options.listContentDirs;
    const discover = this.#options.discoverAuthorizationModelInstanceIds;
    const hasType = this.#options.contentHasAuthorizationModelType;
    if (!listContentDirs || !discover || !hasType) {
      throw new Error(
        'authorization.implementationId is "authorization-model" but the registry was not given content-dir discovery hooks',
      );
    }
    const contentDirs = listContentDirs();
    const configured = contentDirs.some((dir) => hasType(dir));
    if (!configured) {
      throw new Error(
        'authorization.implementationId is "authorization-model" but ontology.json types.authorizationModel is not configured in any corpus',
      );
    }
    return createAuthorizationModelAuthorizer({
      listInstanceIds: () => {
        const ids = new Set<string>();
        for (const dir of listContentDirs()) {
          for (const id of discover(dir)) ids.add(id);
        }
        return [...ids];
      },
      evaluateModification: this.#options.evaluateModification,
    });
  }
}

export function parseBuiltInAuthorizerId(
  value: unknown,
  path: string,
): BuiltInAuthorizerId {
  if (
    value !== "deny-everything" &&
    value !== "allow-everything" &&
    value !== "authorization-model"
  ) {
    throw new Error(
      `${path}: must be "deny-everything", "allow-everything", or "authorization-model" (got ${JSON.stringify(value)})`,
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
  if (obj.implementationId === undefined) {
    throw new Error("tome-server config: authorization.implementationId is required");
  }
  return {
    implementationId: parseBuiltInAuthorizerId(
      obj.implementationId,
      "authorization.implementationId",
    ),
  };
}

export function resolveAuthorizationBuiltIns(
  config?: TomeAuthorizationConfig | null,
): TomeAuthorizationConfig {
  return {
    implementationId: config?.implementationId ?? "deny-everything",
  };
}
