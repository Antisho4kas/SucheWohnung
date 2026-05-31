# Multi-stage build for Next.js frontend
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -w @suchewohnung/shared
RUN npm run build -w @suchewohnung/database
RUN npm run build -w @suchewohnung/web
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd -m app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/web/.next ./.next
COPY --from=build /app/services/web/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./monorepo-package.json
USER app
EXPOSE 8080
CMD ["npm", "start"]
