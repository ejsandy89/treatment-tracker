import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectManifest: {
        // Keep this modest — the app shell itself, not every asset.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
      includeAssets: ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon.svg", "favicon-16.png", "favicon-32.png"],
      manifest: {
        name: "CareTrack",
        short_name: "CareTrack",
        description: "Treatment calendar, appointments and test results tracker",
        start_url: "/",
        display: "standalone",
        background_color: "#F3EFE6",
        theme_color: "#16403F",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
