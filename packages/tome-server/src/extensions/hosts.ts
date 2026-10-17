import type {
  EditorPageBlockHost,
  EditorPageBlockRegistration,
} from "tome-interfaces/page-block/editor";
import type {
  ServerPageBlockHandler,
  ServerPageBlockHost,
} from "tome-interfaces/page-block/server";
import type {
  AuthenticationHost,
  AuthenticationRegistration,
} from "tome-interfaces/authentication";
import type {
  AuthorizationHost,
  ImpQueryAuthorizer,
  ModificationAuthorizer,
} from "tome-interfaces/authorization";
import type {
  SearcherHost,
  SearcherRegistration,
} from "tome-interfaces/search";
import type { AuthorizationRegistry } from "../authorization/registry";

export class EditorPageBlockHostImpl implements EditorPageBlockHost {
  readonly #blocks = new Map<string, EditorPageBlockRegistration>();

  registerPageBlock(registration: EditorPageBlockRegistration): void {
    this.#blocks.set(registration.implementationId, registration);
  }

  get(implementationId: string): EditorPageBlockRegistration | undefined {
    return this.#blocks.get(implementationId);
  }

  list(): EditorPageBlockRegistration[] {
    return [...this.#blocks.values()];
  }

  clear(): void {
    this.#blocks.clear();
  }
}

export class ServerPageBlockHostImpl implements ServerPageBlockHost {
  readonly #handlers = new Map<string, ServerPageBlockHandler>();

  registerPageBlockHandler(handler: ServerPageBlockHandler): void {
    this.#handlers.set(handler.implementationId, handler);
  }

  get(implementationId: string): ServerPageBlockHandler | undefined {
    return this.#handlers.get(implementationId);
  }

  clear(): void {
    this.#handlers.clear();
  }
}

export class SearcherHostImpl implements SearcherHost {
  readonly #searchers = new Map<string, SearcherRegistration>();

  registerSearcher(registration: SearcherRegistration): void {
    this.#searchers.set(registration.implementationId, registration);
  }

  get(implementationId: string): SearcherRegistration | undefined {
    return this.#searchers.get(implementationId);
  }

  clear(): void {
    this.#searchers.clear();
  }
}

export class AuthenticationHostImpl implements AuthenticationHost {
  readonly #providers = new Map<string, AuthenticationRegistration>();

  registerAuthenticationProvider(registration: AuthenticationRegistration): void {
    this.#providers.set(registration.implementationId, registration);
  }

  get(implementationId: string): AuthenticationRegistration | undefined {
    return this.#providers.get(implementationId);
  }

  clear(): void {
    this.#providers.clear();
  }
}

/** Delegates authorizer registration onto a shared AuthorizationRegistry. */
export class AuthorizationHostImpl implements AuthorizationHost {
  constructor(readonly registry: AuthorizationRegistry) {}

  registerImpQueryAuthorizer(authorizer: ImpQueryAuthorizer): void {
    this.registry.registerImpQueryAuthorizer(authorizer);
  }

  registerModificationAuthorizer(authorizer: ModificationAuthorizer): void {
    this.registry.registerModificationAuthorizer(authorizer);
  }
}
