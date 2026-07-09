// Post-build step: renders the /guardian marketing page to a static HTML
// string via react-dom/server and injects it into the built guardian.html
// shell so search engines and non-JS crawlers receive the real landing-page
// copy (H1, feature grid, pricing) instead of an empty <div id="root">.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ssrEntry = path.join(root, "dist/server/entry-server-guardian.js");
const htmlPath = path.join(root, "dist/public/guardian.html");

const { render } = await import(ssrEntry);
const markup = render();

if (!markup || markup.length < 100) {
  throw new Error(
    `Prerendered /guardian markup looks suspiciously empty (${markup?.length ?? 0} chars). Aborting build.`,
  );
}

const html = await readFile(htmlPath, "utf-8");
const rootDiv = '<div id="root"></div>';

if (!html.includes(rootDiv)) {
  throw new Error(
    `Could not find "${rootDiv}" in ${htmlPath}. The prerender injection point may have changed.`,
  );
}

const injected = html.replace(rootDiv, `<div id="root">${markup}</div>`);
await writeFile(htmlPath, injected, "utf-8");

console.log(
  `[prerender-guardian] Injected ${markup.length} chars of static markup into ${path.relative(root, htmlPath)}`,
);
