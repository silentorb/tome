import type {
  HtmlPageBlockHost,
  HtmlPageBlockRenderer,
} from "tome-interfaces/page-block/html";

export class HtmlPageBlockHostImpl implements HtmlPageBlockHost {
  readonly #renderers = new Map<string, HtmlPageBlockRenderer>();

  registerPageBlockRenderer(renderer: HtmlPageBlockRenderer): void {
    this.#renderers.set(renderer.implementationId, renderer);
  }

  get(implementationId: string): HtmlPageBlockRenderer | undefined {
    return this.#renderers.get(implementationId);
  }

  clear(): void {
    this.#renderers.clear();
  }
}
