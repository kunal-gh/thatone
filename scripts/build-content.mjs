#!/usr/bin/env node
/**
 * build-content.mjs
 *
 * Bundles src/extension/content.ts into a single self-contained IIFE at
 * dist/extension/content.js using esbuild.
 *
 * Chrome MV3 content scripts CANNOT use ES module `import` statements.
 * esbuild bundles everything into one file with format:"iife" — no imports.
 *
 * Run after `npm run build`: npm run build:content
 * (The full build script runs both: npm run build && npm run build:content)
 */

import { build } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

async function buildContentScript() {
  console.log("Building content script as self-contained IIFE (esbuild)...");

  mkdirSync(resolve(rootDir, "dist/extension"), { recursive: true });

  await build({
    entryPoints: [resolve(rootDir, "src/extension/content.ts")],
    outfile: resolve(rootDir, "dist/extension/content.js"),
    bundle: true,           // inline ALL imports — no external references
    format: "iife",         // Immediately Invoked Function Expression — no import statements
    platform: "browser",
    target: ["chrome110"],  // MV3 minimum Chrome version
    minify: false,          // keep readable for debugging
    sourcemap: true,
    define: {
      "process.env.NODE_ENV": '"production"'
    },
    // Do not mark anything as external — everything must be inlined
    // This is the critical setting: without it, esbuild leaves import() calls
    external: []
  });

  console.log("✓ dist/extension/content.js built as IIFE");
  console.log("  → No import statements, fully self-contained, Chrome-safe");
}

buildContentScript().catch((err) => {
  console.error("Content script build failed:", err);
  process.exit(1);
});
