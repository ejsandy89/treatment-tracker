import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Treatment Tracker",
        short_name: "Tracker",
        description: "Treatment calendar, appointments and test results tracker",
        start_url: "/",
        display: "standalone",
        background_color: "#F6F7F8",
        theme_color: "#2E3746",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the app shell so it opens even with a flaky connection.
        // API calls to Netlify Functions are always fetched fresh (not cached),
        // since this is live patient data.
        runtimeCaching: [
          {
            urlPattern: /\/\.netlify\/functions\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
