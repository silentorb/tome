import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { extensionImportMapPlugin } from "./src/webview/vite/extension-import-map-plugin";

const root = resolve(import.meta.dirname);

export default defineConfig({
  plugins: [extensionImportMapPlugin(), react()],
  root,
  publicDir: false,
  build: {
    outDir: "dist-webview",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        "ext-react": resolve(root, "src/webview/extension-imports/react.ts"),
        "ext-react-dom": resolve(root, "src/webview/extension-imports/react-dom.ts"),
        "ext-react-dom-client": resolve(root, "src/webview/extension-imports/react-dom-client.ts"),
        "ext-react-jsx-runtime": resolve(root, "src/webview/extension-imports/react-jsx-runtime.ts"),
        "ext-react-jsx-dev-runtime": resolve(
          root,
          "src/webview/extension-imports/react-jsx-dev-runtime.ts",
        ),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        exports: "named",
      },
      preserveEntrySignatures: "exports-only",
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    host: process.env.TOME_EDITOR_DEV_HOST ?? "127.0.0.1",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.TOME_EDITOR_API_PORT ?? "3847"}`,
        changeOrigin: true,
      },
    },
  },
});
