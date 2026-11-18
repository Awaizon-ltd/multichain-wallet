import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the popup / approval UI (index.html). The background service worker,
// content script and in-page provider are bundled separately by
// scripts/build-scripts.mjs, because MV3 needs them as single self-contained
// files (content scripts can't be ES modules).
export default defineConfig({
  plugins: [react()],
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rollupOptions: { input: "index.html" },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["test/setup.ts"],
  },
} as any);
