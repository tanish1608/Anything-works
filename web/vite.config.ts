/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// API_URL can come from the shell or a git-ignored .env.local (e.g. the Cloud Run API shared with the phone app).
const apiURL = process.env.API_URL ?? loadEnv("development", process.cwd(), "").API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "brand/*.svg", "design-assets/*.jpg"],
      manifest: {
        name: "Placeholder AI",
        short_name: "Placeholder AI",
        description: "Daily construction updates, progress and issues in 3D",
        theme_color: "#101b2a",
        background_color: "#101b2a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Authenticated API files are scoped per request; never share them in URL-keyed caches.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { "/api": { target: apiURL, changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    // Real BIM fixtures are large; keep DOM suites within the shared memory/CPU budget.
    maxWorkers: 2,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["e2e/**", "node_modules/**"],
  },
});
