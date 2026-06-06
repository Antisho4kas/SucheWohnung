import { defineConfig } from "vitest/config";

const root = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      "@suchewohnung/shared": `${root}/packages/shared/src/index.ts`,
      "@suchewohnung/database": `${root}/packages/database/src/index.ts`,
      "@suchewohnung/telegram": `${root}/packages/telegram/src/index.ts`,
    },
  },
  test: {
    include: ["packages/**/src/**/*.test.ts", "services/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "packages/shared/src/**/*.ts",
        "services/worker/src/**/*.ts",
        "services/api/src/**/*.ts",
        "services/web/src/lib/api.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/test/**",
        "**/*.test.ts",
        "**/*.e2e.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        "**/main.ts",
        "**/dist/**",
      ],
    },
  },
});
