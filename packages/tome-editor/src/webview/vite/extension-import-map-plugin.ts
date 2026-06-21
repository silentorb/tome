import type { Plugin } from "vite";

const EXTENSION_IMPORTS_ROOT = "/src/webview/extension-imports";

/** Bare specifiers kept external when bundling extension editor modules (see ExtensionServerRuntime). */
export const EXTENSION_SHARED_IMPORTS = {
  react: {
    dev: `${EXTENSION_IMPORTS_ROOT}/react.ts`,
    prod: "/assets/ext-react.js",
  },
  "react-dom": {
    dev: `${EXTENSION_IMPORTS_ROOT}/react-dom.ts`,
    prod: "/assets/ext-react-dom.js",
  },
  "react-dom/client": {
    dev: `${EXTENSION_IMPORTS_ROOT}/react-dom-client.ts`,
    prod: "/assets/ext-react-dom-client.js",
  },
  "react/jsx-runtime": {
    dev: `${EXTENSION_IMPORTS_ROOT}/react-jsx-runtime.ts`,
    prod: "/assets/ext-react-jsx-runtime.js",
  },
  "react/jsx-dev-runtime": {
    dev: `${EXTENSION_IMPORTS_ROOT}/react-jsx-dev-runtime.ts`,
    prod: "/assets/ext-react-jsx-dev-runtime.js",
  },
} as const;

export function buildExtensionImportMap(isDev: boolean): Record<string, string> {
  return Object.fromEntries(
    Object.entries(EXTENSION_SHARED_IMPORTS).map(([specifier, urls]) => [
      specifier,
      isDev ? urls.dev : urls.prod,
    ]),
  );
}

export function renderExtensionImportMapScript(isDev: boolean): string {
  const imports = buildExtensionImportMap(isDev);
  return `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`;
}

/** Inject import maps so API-served extension bundles can resolve shared React modules. */
export function extensionImportMapPlugin(): Plugin {
  return {
    name: "tome-extension-import-map",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const script = renderExtensionImportMapScript(!!ctx.server);
        if (html.includes('type="importmap"')) return html;
        return html.replace("</head>", `  ${script}\n  </head>`);
      },
    },
  };
}
