import { describe, expect, test } from "bun:test";
import { register } from "tome-extension-fixture/html";
import { HtmlPageBlockHostImpl } from "../../src/extensions/html-host";
import { createPageBlockHtmlContext, renderNodeBodyHtml } from "../../src/lib/page-block-html";
import type { ResolvedExtensionComponent } from "tome-db";
import { serializePageBlock } from "tome-interfaces/page-block";

describe("page-block html rendering", () => {
  test("renders fixture block html", async () => {
    const host = new HtmlPageBlockHostImpl();
    register(host);

    const components: ResolvedExtensionComponent[] = [
      {
        id: "fixture.demo",
        extensionId: "fixture",
        implementationId: "fixture-demo",
        label: "Fixture block",
        kind: "page-block",
        params: {},
        extension: { id: "fixture" },
      },
    ];

    const ctx = createPageBlockHtmlContext(host, components, "node123", "/content");
    const body = `Intro\n\n${serializePageBlock("fixture.demo", { text: "Hello" })}\n\nOutro`;
    const html = await renderNodeBodyHtml(body, "Title", "/", () => "Untitled", ctx);
    expect(html).toContain("tome-page-block-fixture");
    expect(html).toContain("Hello");
  });

  test("unknown block uses fallback html", async () => {
    const host = new HtmlPageBlockHostImpl();
    const ctx = createPageBlockHtmlContext(host, [], "node123", "/content");
    const body = serializePageBlock("missing.block", {});
    const html = await renderNodeBodyHtml(body, "Title", "/", () => "Untitled", ctx);
    expect(html).toContain("tome-page-block-unknown");
  });

  test("async html renderer is awaited", async () => {
    const host = new HtmlPageBlockHostImpl();
    host.registerPageBlockRenderer({
      implementationId: "async-demo",
      async renderHtml() {
        await Promise.resolve();
        return "<div class=\"async-block\">done</div>";
      },
    });

    const components: ResolvedExtensionComponent[] = [
      {
        id: "async.demo",
        extensionId: "async",
        implementationId: "async-demo",
        label: "Async block",
        kind: "page-block",
        params: {},
        extension: { id: "async" },
      },
    ];

    const ctx = createPageBlockHtmlContext(host, components, "node123", "/content");
    const body = serializePageBlock("async.demo", {});
    const html = await renderNodeBodyHtml(body, "Title", "/", () => "Untitled", ctx);
    expect(html).toContain("async-block");
  });
});
