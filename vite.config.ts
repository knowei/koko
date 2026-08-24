import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    port: 5174,
    open: false,
    watch: {
      ignored: ["**/dist-installer*/**", "**/release/**", "**/scratch/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
