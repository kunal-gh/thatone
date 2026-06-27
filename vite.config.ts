import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// NOTE: Content script is built separately via scripts/build-content.mjs
// using Rollup in IIFE mode (no ES module imports — required for MV3 content scripts).
// The main Vite build handles: index.html, app.html, popup.html, background.ts.

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(rootDir, "index.html"),
        app: resolve(rootDir, "app.html"),
        popup: resolve(rootDir, "popup.html"),
        background: resolve(rootDir, "src/extension/background.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "extension/background.js";
          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    }
  }
});
