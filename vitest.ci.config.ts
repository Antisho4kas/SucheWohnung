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
        "packages/database/src/**/*.ts",
        "packages/telegram/src/**/*.ts",
        "services/worker/src/**/*.ts",
        "services/api/src/**/*.ts",
        "services/bot/src/**/*.ts",
        "services/web/src/components/ProfileForm.tsx",
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
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 65,
        lines: 68,
        "packages/shared/src/**/*.ts": {
          statements: 80,
          branches: 70,
          functions: 82,
          lines: 82,
        },
        "services/web/src/lib/api.ts": {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80,
        },
        "services/web/src/components/ProfileForm.tsx": {
          statements: 35,
          branches: 35,
          functions: 35,
          lines: 35,
        },
      },
    },
  },
});
