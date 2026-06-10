# Local Docker Runbook

This project is local-first. Docker is used first for local infrastructure, then the React and Express apps can be added to Compose after they are scaffolded.

## Current Docker Services

| Service | Purpose | Host URL / Port |
| --- | --- | --- |
| postgres | Local PostgreSQL database for Prisma and backend integration tests | `localhost:5432` |
| mailpit | Local SMTP catcher for future email verification/password reset flows | UI: `http://localhost:8025`, SMTP: `localhost:1025` |

The Postgres init script creates two local databases:

| Database | Purpose |
| --- | --- |
| `cloneinsta` | Normal local development |
| `cloneinsta_test` | Integration tests and Prisma test runs |

## Start Local Infrastructure

```bash
docker compose up -d postgres mailpit
docker compose ps
```

If Docker reports that it cannot find `dockerDesktopLinuxEngine` or a Docker pipe, Docker Desktop is installed but not running. Start Docker Desktop first, wait until the daemon is ready, then rerun the Compose command.

## Stop Local Infrastructure

```bash
docker compose down
```

This keeps the PostgreSQL Docker volume. To reset all local database data:

```bash
docker compose down -v
```

## Backend Environment Values

Use this database URL when the backend runs on the host machine with `npm run dev`:

```env
DATABASE_URL="postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta?schema=public"
TEST_DATABASE_URL="postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta_test?schema=public"
```

If the backend is later moved into Docker Compose, use the service name instead of `localhost`:

```env
DATABASE_URL="postgresql://cloneinsta:cloneinsta_dev_password@postgres:5432/cloneinsta?schema=public"
TEST_DATABASE_URL="postgresql://cloneinsta:cloneinsta_dev_password@postgres:5432/cloneinsta_test?schema=public"
```

Future email settings for host-run backend:

```env
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_SECURE="false"
```

Future email settings for Compose-run backend:

```env
SMTP_HOST="mailpit"
SMTP_PORT="1025"
SMTP_SECURE="false"
```

## Expected Next Step After Scaffold

After `client/` and `server/` exist, keep this Compose file as the source of local PostgreSQL and Mailpit. Add app containers only if Dockerized app startup becomes part of the grading/demo requirement.
