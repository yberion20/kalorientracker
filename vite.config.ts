/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH wird beim GitHub-Pages-Build auf "/<repo>/" gesetzt.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "icon.svg"],
      manifest: {
        name: "Kalorientracker",
        short_name: "Kalorien",
        description: "Kalorien, Makros und Gewicht tracken",
        lang: "de",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f4f5f7",
        theme_color: "#f4f5f7",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,wasm,json}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "off-images", expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
  test: { environment: "node" },
});
