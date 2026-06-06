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
      "services/api/src/admin/dto.test.ts",
      "services/api/src/auth/auth.service.test.ts",
      "services/api/src/auth/dto.test.ts",
      "services/api/src/auth/guards.test.ts",
      "services/api/src/auth/jwt-config.test.ts",
      "services/api/src/auth/jwt.strategy.test.ts",
      "services/api/src/common/errors.filter.test.ts",
      "services/api/src/config/configuration.test.ts",
      "services/api/src/listings/dto.test.ts",
      "services/api/src/profiles/profiles.service.test.ts",
      "services/api/src/telegram/telegram-webhook.module.test.ts",
      "services/api/src/users/dto.test.ts",
    ],
  },
});
