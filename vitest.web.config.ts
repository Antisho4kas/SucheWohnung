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
      "services/web/src/lib/api.infrastructure.test.ts",
      "services/web/src/lib/api.test.ts",
      "services/web/src/components/ProfileForm.test.ts",
    ],
  },
});
