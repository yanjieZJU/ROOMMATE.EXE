import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["e2e/**", "scripts/**", "node_modules/**", "dist/**"],
  },
});
