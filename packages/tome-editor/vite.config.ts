import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname),
  publicDir: false,
  build: {
    outDir: "dist-webview",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "index.html"),
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
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
