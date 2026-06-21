import { describe, expect, test } from "bun:test";
import {
  buildExtensionImportMap,
  renderExtensionImportMapScript,
} from "../../src/webview/vite/extension-import-map-plugin";

describe("extension import map", () => {
  test("maps React shared modules for dev and production", () => {
    expect(buildExtensionImportMap(true)["react/jsx-dev-runtime"]).toBe(
      "/src/webview/extension-imports/react-jsx-dev-runtime.ts",
    );
    expect(buildExtensionImportMap(false)["react/jsx-dev-runtime"]).toBe(
      "/assets/ext-react-jsx-dev-runtime.js",
    );
  });

  test("renders import map script tag", () => {
    const script = renderExtensionImportMapScript(true);
    expect(script).toContain('type="importmap"');
    expect(script).toContain('"react/jsx-dev-runtime"');
    expect(script).toContain("/src/webview/extension-imports/react-jsx-dev-runtime.ts");
  });
});
