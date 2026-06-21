import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestContentFixture, destroyTestContentFixture, type TestContentFixture } from "tome-db/content";
import { serializeExtensionsFile } from "tome-db";
import { serializePageBlock } from "tome-interfaces/page-block";
import { ExtensionServerRuntime } from "../../src/api/extensions/runtime";

describe("ExtensionServerRuntime", () => {
  let fixture: TestContentFixture;

  beforeAll(() => {
    fixture = createTestContentFixture("tome-ext-api-");
    const modelDir = join(fixture.tempDir, "content", "model");
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(
      join(modelDir, "extensions.json"),
      serializeExtensionsFile({
        version: 1,
        extensions: [
          {
            id: "fixture",
            enabled: true,
            editorModule: "tome-extension-fixture/editor",
            htmlModule: "tome-extension-fixture/html",
            serverModule: "tome-extension-fixture/server",
          },
        ],
        components: [
          {
            id: "fixture.demo",
            extensionId: "fixture",
            kind: "page-block",
            implementationId: "fixture-demo",
            label: "Fixture block",
            enabled: true,
          },
        ],
      }),
      "utf-8",
    );
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("loads manifest and invokes server handler", async () => {
    const runtime = new ExtensionServerRuntime(join(fixture.tempDir, "content"));
    await runtime.ensureLoaded();
    const manifest = runtime.getPublicManifest();
    expect(manifest.components.some((c) => c.id === "fixture.demo")).toBe(true);
    expect(manifest.editorBundles.some((b) => b.extensionId === "fixture")).toBe(true);

    const result = await runtime.invokeExtension("fixture.demo", { ping: 1 }, "abc");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ok: true, echo: { ping: 1 } });
    }
  });

  test("prepareEditorBody expands page blocks via htmlModule", async () => {
    const runtime = new ExtensionServerRuntime(join(fixture.tempDir, "content"));
    await runtime.ensureLoaded();
    expect(runtime.htmlHost.get("fixture-demo")).toBeDefined();

    const body = serializePageBlock("fixture.demo", { text: "Hi" });
    const expanded = await runtime.prepareEditorBody("abc", body);
    expect(expanded).toContain("<!-- tome-page-block ");
    expect(expanded).toContain("tome-page-block-fixture");
    expect(expanded).toContain("Hi");
  });

  test("bundles editor module for browser import", async () => {
    const runtime = new ExtensionServerRuntime(join(fixture.tempDir, "content"));
    await runtime.ensureLoaded();
    const bundle = await runtime.bundleEditorModule("fixture");
    expect(bundle).toBeTruthy();
    expect(bundle).toContain("register");
    expect(bundle).toContain('"react/jsx-runtime"');
    expect(bundle).not.toContain('"react/jsx-dev-runtime"');
  });
});
