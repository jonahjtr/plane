# Plane (Self-Hosted) — Digital Kingsmen Fork

This is DK's fork of [Plane](https://github.com/makeplane/plane), an open-source project management tool. It runs fully self-hosted via Docker on macOS using colima.

**Live instance:** http://localhost:8282  
**Fork:** https://github.com/jonahjtr/plane  
**Upstream:** https://github.com/makeplane/plane

---

## Quick Start / Stop

```bash
# Start everything (colima VM + all containers):
./start.sh

# Stop everything:
./stop.sh
```

That's it. `start.sh` boots the colima VM, starts all 12 Docker containers, and waits until the app is responding at http://localhost:8282.

---

## What's Running (12 containers)

| Container      | What it does                              |
|----------------|-------------------------------------------|
| `proxy`        | Caddy reverse proxy (port 8282 → all)     |
| `web`          | Next.js main app                          |
| `admin`        | Next.js admin panel (`/god-mode`)         |
| `space`        | Next.js public pages (`/spaces`)          |
| `api`          | Django REST API (Gunicorn)                |
| `bgworker`     | Celery background worker                  |
| `beatworker`   | Celery beat scheduler                     |
| `plane-live`   | Real-time collab server (HocusPocus)      |
| `plane-db`     | PostgreSQL 15                             |
| `plane-redis`  | Valkey (Redis-compatible)                 |
| `plane-mq`     | RabbitMQ                                  |
| `plane-minio`  | MinIO (S3-compatible file storage)        |

---

## Prerequisites

- **colima** — lightweight Docker VM for macOS (`brew install colima`)
- **docker + docker-compose** — (`brew install docker docker-compose`)
- **docker-buildx** — (`brew install docker-buildx`)
- Docker CLI plugins dir configured in `~/.docker/config.json`:
  ```json
  { "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"] }
  ```

---

## Colima VM Specs

The VM runs with **4 CPU / 8GB RAM / 40GB disk**. These are set in `start.sh`. If you need to change them, edit the `colima start` line. Don't go below 4GB RAM — Plane needs it.

---

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | All container definitions |
| `.env` | Root env: DB creds, ports, MinIO keys |
| `apps/api/.env` | API env: DB URL, Redis, base URLs |
| `apps/proxy/Caddyfile.ce` | Reverse proxy routing config |
| `start.sh` | One-command startup |
| `stop.sh` | One-command shutdown |

---

## Custom Changes (vs upstream)

1. **Caddyfile.ce** — Fixed global config block ordering (upstream bug)
2. **docker-compose.yml** — Added missing env vars for proxy and live service
3. **apps/api/.env** — All base URLs point to `localhost:8282` (through proxy) instead of individual container ports
4. **Top nav** — Removed "Star us on GitHub" link, replaced with custom text
5. **Port** — Runs on `8282` instead of `80` (no root needed)

---

## Rebuilding After Code Changes

If you edit frontend code (anything in `apps/web`, `apps/admin`, `apps/space`):

```bash
# Rebuild just the changed app:
docker compose build web        # or admin, space, live, proxy
docker compose up -d --force-recreate web
```

If you edit API code (`apps/api`):

```bash
docker compose build api
docker compose up -d --force-recreate api worker beat-worker
```

---

## Pulling Updates from Upstream

```bash
git fetch upstream
git merge upstream/preview
# Resolve any conflicts, then rebuild:
docker compose build
docker compose up -d
```

---

## Useful Commands

```bash
# Check container status:
docker ps

# View logs for a container:
docker logs api
docker logs proxy

# Restart a specific service:
docker compose restart api

# Full rebuild from scratch:
docker compose down
docker compose build --no-cache
docker compose up -d

# Shell into a container:
docker exec -it api bash
```

---

## Troubleshooting

**Proxy keeps restarting?**  
Check `docker logs proxy`. Usually a Caddyfile syntax issue. The env vars `SITE_ADDRESS`, `CERT_EMAIL`, etc. must be passed through in `docker-compose.yml`.

**Login redirects to wrong port?**  
Check `apps/api/.env` — all `*_BASE_URL` values should be `http://localhost:8282`.

**plane-live restarting?**  
Needs `API_BASE_URL`, `LIVE_SERVER_SECRET_KEY`, and `REDIS_HOST` set. These are in the `live` service's `environment` block in `docker-compose.yml`.

**Colima won't start?**  
Try `colima delete` then `colima start --cpu 4 --memory 8 --disk 40`. This wipes the VM but Docker volumes (DB data) persist if you used named volumes.

**Out of disk in the VM?**  
`colima ssh -- df -h`. If full, prune: `docker system prune -a --volumes`.
