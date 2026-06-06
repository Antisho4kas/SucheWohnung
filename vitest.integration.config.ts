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
    include: ["services/worker/src/test/**/*.smoke.ts"],
    hookTimeout: 60_000,
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
