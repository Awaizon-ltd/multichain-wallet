import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two pages: the site and the privacy policy (served at /privacy/).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        privacy: resolve(__dirname, "privacy/index.html"),
        brand: resolve(__dirname, "brand/index.html"),
      },
    },
  },
});
