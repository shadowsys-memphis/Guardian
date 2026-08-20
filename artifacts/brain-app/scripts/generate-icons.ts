// GENERATED ARTIFACTS — run this script (`pnpm run generate:icons`) any time
// MARK_PATHS in ../src/components/presence-field/mark-paths.ts changes.
// It is the single source of truth for every rasterized/static copy of the
// Presence Field mark outside <PresenceMark/> itself:
//   - public/favicon.svg          (2 outer rings, heavier stroke — legible at 16px)
//   - public/icons/icon-192.png   (maskable, warm-pearl background)
//   - public/icons/icon-512.png   (maskable, warm-pearl background)
//   - public/icons/apple-touch-icon.png
// Keeping generation code-driven (instead of hand-edited SVG/PNGs) means the
// mark can never drift out of sync with the live component the way a
// hand-copied favicon previously did.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MARK_PATHS } from "../src/components/presence-field/mark-paths.ts";

const root = path.resolve(import.meta.dirname, "..");

// Same gradient as PresenceMark.tsx, with the CSS-variable fallbacks resolved
// to literal hex — these files are loaded standalone (favicon, home-screen
// icon) with no access to the app's :root custom properties.
const GRADIENT_STOPS = [
  { offset: 0, color: "#22303F" },
  { offset: 0.42, color: "#2F4256" },
  { offset: 1, color: "#D9A441" },
] as const;

// Matches --background (warm pearl) in src/index.css — the same surface the
// mark sits on inside the app, so the icon reads as a continuation of the
// product rather than a mismatched swatch.
const ICON_BG = "#F6F1EA";

function gradientDefs(id: string): string {
  const stops = GRADIENT_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join("");
  return `<linearGradient id="${id}" x1="0.12" y1="0.02" x2="0.88" y2="0.98">${stops}</linearGradient>`;
}

function ringPaths(paths: typeof MARK_PATHS): string {
  return paths.map((p) => `<path d="${p.d}" opacity="${p.opacity}"/>`).join("\n    ");
}

// ─── favicon.svg — 2 outer rings only (the 3rd mushes together at 16-24px) ──
function buildFaviconSvg(): string {
  const [outer, , inner] = MARK_PATHS; // skip the middle ring
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Brain Guardian">
  <defs>${gradientDefs("pmGrad")}</defs>
  <g stroke="url(#pmGrad)" stroke-width="4.2" stroke-linejoin="round" fill="none">
    ${ringPaths([{ ...outer, opacity: 1 }, { ...inner, opacity: 0.75 }])}
  </g>
</svg>
`;
}

// ─── app icons — full 3-ring mark, centered in a safe zone for maskable ────
// markFraction 0.6 keeps the mark within a ~30%-radius circle from center,
// well inside the 40%-radius safe zone Android's adaptive-icon mask guarantees.
function buildIconSvg(canvas: number, markFraction = 0.6): string {
  const markSize = canvas * markFraction;
  const offset = (canvas - markSize) / 2;
  const scale = markSize / 64;
  return `<svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${canvas}" height="${canvas}" fill="${ICON_BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <defs>${gradientDefs("pmGrad")}</defs>
    <g stroke="url(#pmGrad)" stroke-width="3.4" stroke-linejoin="round" fill="none">
      ${ringPaths(MARK_PATHS)}
    </g>
  </g>
</svg>`;
}

const faviconPath = path.join(root, "public/favicon.svg");
await writeFile(faviconPath, buildFaviconSvg(), "utf-8");
console.log(`Wrote ${path.relative(root, faviconPath)}`);

const pngTargets = [
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
];

for (const target of pngTargets) {
  const outPath = path.join(root, target.file);
  await sharp(Buffer.from(buildIconSvg(target.size))).png().toFile(outPath);
  console.log(`Wrote ${path.relative(root, outPath)} (${target.size}x${target.size})`);
}
