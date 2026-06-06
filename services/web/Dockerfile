# Multi-stage build for Next.js frontend
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
RUN npx --yes prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w @suchewohnung/shared
RUN npm run build -w @suchewohnung/database
RUN npm run build -w @suchewohnung/web
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd -m app
COPY --from=build --chown=app:app /app/services/web/.next/standalone ./
COPY --from=build --chown=app:app /app/services/web/.next/static ./services/web/.next/static
USER app
EXPOSE 8080
CMD ["node", "services/web/server.js"]
