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
      "services/api/src/admin/admin.controller.test.ts",
      "services/api/src/api.security.e2e.test.ts",
      "services/api/src/telegram/telegram-webhook.module.test.ts",
      "services/web/src/lib/api.test.ts",
      "services/web/src/components/ProfileForm.test.ts",
    ],
  },
});
