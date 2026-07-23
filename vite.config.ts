import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      base,
      scope: base,
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "Landjuweel 2026 Festival Planner",
        short_name: "Landjuweel",
        description: "The unofficial English festival planner that works without a signal.",
        theme_color: "#140c1f",
        background_color: "#140c1f",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: base,
        scope: base,
        categories: ["entertainment", "events", "lifestyle"],
        icons: [
          {
            src: `${base}icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: `${base}icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,woff,woff2,png,jpg,jpeg,svg}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    target: "es2022",
    sourcemap: true
  }
});
