import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/server/index.ts",
    outDir: "dist/server",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "index.mjs" } },
  },
});
