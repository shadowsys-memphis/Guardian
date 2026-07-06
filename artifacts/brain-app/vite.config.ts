import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
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

// Plugin: serve route-specific HTML files in dev mode for public acquisition routes.
// In production the build.rollupOptions.input entries handle this via separate HTML outputs.
function publicRouteHtmlPlugin() {
  const root = path.resolve(import.meta.dirname);
  const routes: Record<string, string> = {
    "/guardian": path.join(root, "guardian.html"),
    "/guardian/success": path.join(root, "guardian-success.html"),
  };
  return {
    name: "public-route-html",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const htmlFile = routes[url] ?? routes[url.replace(/\/$/, "")];
        if (htmlFile && fs.existsSync(htmlFile)) {
          server.transformIndexHtml(url, fs.readFileSync(htmlFile, "utf-8")).then((html) => {
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          }).catch(next);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    publicRouteHtmlPlugin(),
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
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        guardian: path.resolve(import.meta.dirname, "guardian.html"),
        "guardian-success": path.resolve(import.meta.dirname, "guardian-success.html"),
      },
    },
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
