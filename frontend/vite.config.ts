import path from "node:path";
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
      filename: "sw.ts",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Fitness Mini App",
        short_name: "Fitness",
        theme_color: "#2481cc",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
      },
      injectManifest: {
        // Precache only the application shell. Exercise GIFs, barcode scanner,
        // and route chunks are downloaded when the user opens that feature.
        globPatterns: [
          "index.html",
          "manifest.webmanifest",
          "assets/index-*.js",
          "assets/index-*.css",
          "assets/vendor-react-*.js",
          "assets/vendor-storage-*.js",
          "assets/virtual_pwa-register-*.js",
          "assets/workbox-window*.js",
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
    // Single public host (Tailscale Funnel): browser XHR → API, navigation → SPA.
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
        "/supplements": { ...toApi },
        "/ai": { ...toApi },
        "/notifications": { ...toApi },
        "/feedback": { ...toApi },
        // Admin CRM (users list/reset/delete) — same-origin via Vite proxy
        "/admin": { ...toApi },
        // Telegram webhook must always hit API (no HTML bypass needed for POST)
        "/telegram": { target, changeOrigin: true },
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@zxing")) return "vendor-zxing";
          if (id.includes("dexie")) return "vendor-storage";
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            /node_modules[\\/](react|scheduler)[\\/]/.test(id)
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
});
