import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Fitness Mini App",
        short_name: "Fitness",
        theme_color: "#2481cc",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Never cache API — Dexie/sync queue owns offline data
            urlPattern: ({ url }) =>
              [
                "/auth",
                "/exercises",
                "/programs",
                "/workouts",
                "/users",
                "/health",
                "/nutrition",
                "/ai",
                "/notifications",
              ].some((p) => url.pathname.startsWith(p)),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    // Single public host (ngrok free): browser XHR → API, document navigation → SPA.
    // Critical: /programs and /workouts exist both as React routes and API paths.
    proxy: (() => {
      const target = "http://127.0.0.1:8001";
      const toApi = {
        target,
        changeOrigin: true,
        bypass(req: { headers: { accept?: string }; method?: string }) {
          const accept = req.headers.accept || "";
          // Browser page navigation asks for HTML — keep SPA. XHR/fetch asks for JSON.
          if (req.method === "GET" && accept.includes("text/html")) {
            return "/index.html";
          }
        },
      };
      return {
        "/auth": { ...toApi },
        "/exercises": { ...toApi },
        "/programs": { ...toApi },
        "/workouts": { ...toApi },
        "/users": { ...toApi },
        "/nutrition": { ...toApi },
        "/ai": { ...toApi },
        "/notifications": { ...toApi },
        "/health": { ...toApi },
        "/docs": { target, changeOrigin: true },
        "/redoc": { target, changeOrigin: true },
        "/openapi.json": { target, changeOrigin: true },
      };
    })(),
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
