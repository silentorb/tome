import type {
  EditorPageBlockHost,
  EditorPageBlockRegistration,
} from "tome-interfaces/page-block/editor";
import type {
  ServerPageBlockHandler,
  ServerPageBlockHost,
} from "tome-interfaces/page-block/server";
import type {
  SearcherHost,
  SearcherRegistration,
} from "tome-interfaces/search";

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
