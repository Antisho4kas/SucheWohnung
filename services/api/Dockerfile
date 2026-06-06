# Multi-stage build for NestJS API
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx --yes prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w @suchewohnung/shared
RUN npm run build -w @suchewohnung/database
RUN npm run build -w @suchewohnung/telegram
RUN npm run build -w @suchewohnung/api
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd -m app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/api/node_modules ./node_modules
COPY --from=build /app/services/api/dist ./dist
COPY --from=build /app/services/api/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./monorepo-package.json
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
