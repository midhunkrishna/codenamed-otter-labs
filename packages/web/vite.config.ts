/// <reference types="vitest" />
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Frozen contract (orchestrator-owned): the UI dev server proxies all `/api`
// and `/ws` traffic to the local backend on port 4873 (MIN-13 invariants:
// API stays under /api, WebSocket stays under /ws).
const BACKEND = "http://localhost:4873";

export default defineConfig({
  plugins: [vanillaExtractPlugin(), react()],
  server: {
    host: '0.0.0.0',
    port: 5873,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
