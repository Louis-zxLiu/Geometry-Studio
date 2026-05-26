import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: [
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/lang-python",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
    ],
  },
  optimizeDeps: {
    exclude: [
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/lang-python",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
    ],
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
