import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
var rootDir = fileURLToPath(new URL(".", import.meta.url));
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
                popup: resolve(rootDir, "index.html"),
                app: resolve(rootDir, "app.html"),
                background: resolve(rootDir, "src/extension/background.ts"),
                content: resolve(rootDir, "src/extension/content.ts")
            },
            output: {
                entryFileNames: function (chunkInfo) {
                    if (chunkInfo.name === "background") {
                        return "extension/background.js";
                    }
                    if (chunkInfo.name === "content") {
                        return "extension/content.js";
                    }
                    return "assets/[name].js";
                },
                chunkFileNames: "assets/[name].js",
                assetFileNames: "assets/[name].[ext]"
            }
        }
    }
});
