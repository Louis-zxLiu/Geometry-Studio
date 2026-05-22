import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    esbuildOptions: {
      target: "chrome90",
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "chrome90",
    rollupOptions: {
      input: "index.html",
    },
  },
  server: {
    port: 34115,
    strictPort: true,
  },
});
