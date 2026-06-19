import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist-server",
    ssr: "src/server/ownerlensServer.ts",
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "ownerlens-server.js"
      }
    }
  }
});
