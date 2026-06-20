import type { ServerPageBlockHost } from "tome-interfaces/page-block/server";

export function register(host: ServerPageBlockHost): void {
  host.registerPageBlockHandler({
    implementationId: "fixture-demo",
    async invoke(_ctx, input) {
      return { ok: true, echo: input ?? null };
    },
  });
}
