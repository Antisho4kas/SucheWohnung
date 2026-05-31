import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "services/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/shared/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/index.ts", "**/*.d.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80 },
    },
  },
});
