import type {
  EditorPageBlockHost,
  EditorPageBlockRegistration,
} from "tome-interfaces/page-block/editor";

export class ClientEditorPageBlockHost implements EditorPageBlockHost {
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
}
