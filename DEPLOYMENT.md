# Deployment Guide

## GitHub Actions CI/CD

Docker images are built automatically via GitHub Actions on every push to `main`.

### Workflow

1. **Push to main** triggers `.github/workflows/ci.yml`
2. **Tests & Lint** — code checks, tests, TypeScript
3. **Build Docker** — parallel build of 4 images:
   - `ghcr.io/<user>/<repo>/api:latest`
   - `ghcr.io/<user>/<repo>/web:latest`
   - `ghcr.io/<user>/<repo>/worker:latest`
   - `ghcr.io/<user>/<repo>/bot:latest`

### GitHub Container Registry Setup

1. Ensure your repo is **public** or **private** (GHCR works for both)
2. The workflow uses `secrets.GITHUB_TOKEN` — no additional setup needed
3. Images are tagged with `latest` and short SHA

### Local Production Deploy

```bash
# 1. Copy example env
cp .env.example .env
# Edit .env — add TELEGRAM_BOT_TOKEN, DB_PASSWORD, etc.

# 2. Pull and run pre-built images
docker compose -f docker-compose.prod.yml up -d

# 3. Run migrations (first time)
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### Manual Build (if needed)

```bash
# Build locally (not recommended for production)
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80 | Frontend proxy |
| api | 3000 | REST API |
| web | 8080 | Next.js frontend |
| postgres | 5432 | PostgreSQL + PostGIS |
| redis | 6379 | Redis 7 |
| worker-* | — | Background workers |
| bot | — | Telegram bot |
