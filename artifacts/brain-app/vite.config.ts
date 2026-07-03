import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const rawSiteUrl = process.env.VITE_PUBLIC_SITE_URL;

if (!rawSiteUrl) {
  throw new Error(
    "VITE_PUBLIC_SITE_URL environment variable is required but was not provided. " +
      "Set it to the absolute origin of the site (e.g. https://example.com) so that " +
      "Open Graph and Twitter share-preview tags resolve correctly.",
  );
}

// Validate that VITE_PUBLIC_SITE_URL is a well-formed absolute origin.
// We parse it and require an http/https protocol, then normalise to url.origin
// (which strips any path, query, or hash) so that index.html tag values are stable.
let parsedSiteUrl: URL;
try {
  parsedSiteUrl = new URL(rawSiteUrl);
} catch {
  throw new Error(
    `VITE_PUBLIC_SITE_URL is not a valid URL: "${rawSiteUrl}". ` +
      "Expected an absolute origin such as https://example.com",
  );
}

if (parsedSiteUrl.protocol !== "https:" && parsedSiteUrl.protocol !== "http:") {
  throw new Error(
    `VITE_PUBLIC_SITE_URL must use http or https protocol, got "${parsedSiteUrl.protocol}" in "${rawSiteUrl}".`,
  );
}

// Normalise to a bare origin (no path, query, or trailing slash) so that
// %VITE_PUBLIC_SITE_URL%/opengraph.jpg never produces double-slash or path-relative URLs.
process.env.VITE_PUBLIC_SITE_URL = parsedSiteUrl.origin;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
