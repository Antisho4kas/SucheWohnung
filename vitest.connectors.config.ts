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
    include: [
      "packages/shared/src/connectors/**/*.test.ts",
      "packages/shared/src/__tests__/connectors-fixtures.test.ts",
    ],
  },
});
