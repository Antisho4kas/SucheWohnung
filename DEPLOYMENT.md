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

# 2. Validate and run pre-built images
docker compose -f docker-compose.prod.yml config --quiet
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
| nginx web | `80` | Frontend proxy. |
| nginx API proxy | `3000` | API proxy exposed by nginx. |
| api direct | `127.0.0.1:3001` | REST API direct bind; avoids nginx port `3000`. |
| web direct | `127.0.0.1:8080` | Next.js frontend direct bind for local smoke/debug. |
| postgres | internal only | PostgreSQL + PostGIS. |
| redis | internal only | Redis 7. |
| worker-* | — | Background workers |
| bot | — | Telegram bot |

### Secret Hygiene

- Root `.dockerignore` excludes `.env`, `.env.*`, `secrets/`, dependency folders, build outputs, logs, local database dumps, archives, and tool outputs from shared Node build contexts.
- `services/immo-api/.dockerignore` protects the service-local Python build context, because root `.dockerignore` does not apply when the Compose build context is `./services/immo-api`.
- `docker-compose.prod.yml` requires `DB_PASSWORD`; it does not fall back to the local development password.
- Use `docker compose config --quiet` for validation when real `.env` files are present; do not paste full rendered config output containing runtime secrets.
