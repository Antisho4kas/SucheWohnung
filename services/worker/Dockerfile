# Multi-stage build for Workers
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build in explicit dependency order: shared → database → worker
RUN cd packages/shared && npm run build
RUN cd packages/database && npx prisma generate
RUN cd packages/database && npm run build
RUN cd services/worker && npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd -m app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/worker/dist ./dist
COPY --from=build /app/services/worker/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./monorepo-package.json
USER app
CMD ["node", "dist/main.js"]
