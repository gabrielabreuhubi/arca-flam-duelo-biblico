import { defineConfig } from "vite";

export default defineConfig({
  base: "/arca-flam-duelo-biblico/",
  plugins: [],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
