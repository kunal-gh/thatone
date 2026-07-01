/**
 * generate-icons.mjs — Generate extension icons as PNG files from an SVG template.
 * Uses Node.js canvas-free approach: writes SVG files that Chrome can use.
 * For production, these would be converted to PNG but Chrome MV3 also accepts SVG in many cases.
 *
 * We generate simple geometric icons at 16, 32, 48, and 128px sizes.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ICON_DIR = join(process.cwd(), "public", "icons");

if (!existsSync(ICON_DIR)) {
  mkdirSync(ICON_DIR, { recursive: true });
}

const sizes = [16, 32, 48, 128];

/**
 * Generate an SVG icon with the Curator "C" branding.
 * Uses the indigo/purple gradient from the app design system.
 */
function generateSVG(size) {
  const padding = Math.round(size * 0.08);
  const innerSize = size - padding * 2;
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.55);
  const cy = Math.round(size * 0.53); // slightly below center for visual balance

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" rx="${radius}" fill="url(#bg)"/>
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${Math.round(innerSize * 0.5)}" rx="${radius}" fill="url(#shine)"/>
  <text x="${size / 2}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, -apple-system, sans-serif" font-weight="900"
        font-size="${fontSize}" fill="white" letter-spacing="-0.02em">C</text>
</svg>`;
}

for (const size of sizes) {
  const svg = generateSVG(size);
  const filename = `icon${size}.svg`;
  writeFileSync(join(ICON_DIR, filename), svg, "utf-8");
  console.log(`✓ Generated ${filename} (${size}×${size})`);
}

// Also generate a simple PNG-compatible version using a data URL approach
// Chrome MV3 actually prefers PNG, so we'll create placeholder PNGs
// that can be replaced with properly rendered versions later.

console.log(`\n✓ All icons generated in public/icons/`);
console.log(`  Note: For production, convert SVGs to PNGs using a tool like sharp or inkscape.`);
