# Local Docker Runbook

This project is local-first. Docker is used first for local infrastructure, then the React and Express apps can be added to Compose after they are scaffolded.

## Current Docker Services

| Service  | Purpose                                                                                  | Host URL / Port                                     |
| -------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| postgres | Local PostgreSQL database for Prisma and backend integration tests                       | `localhost:5432`                                    |
| mailpit  | Local SMTP catcher for the current mail-boundary proof and later account-lifecycle flows | UI: `http://localhost:8025`, SMTP: `localhost:1025` |

The Postgres init script creates two local databases:

| Database          | Purpose                                |
| ----------------- | -------------------------------------- |
| `cloneinsta`      | Normal local development               |
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

SMTP settings for the host-run backend:

```env
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_FROM="noreply@cloneinsta.local"
```

If the backend later runs inside Docker Compose, use the `mailpit` service hostname:

```env
SMTP_HOST="mailpit"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_FROM="noreply@cloneinsta.local"
```

## Prove Local Email Delivery

After Mailpit is running, execute:

```bash
npm run mail:verify --workspace server
```

The command sends a safe fixed test message through the configured SMTP boundary and polls Mailpit's local API for the exact subject. It prints `Mailpit SMTP delivery proof passed.` only after Mailpit receives that message. It does not create application data, HTTP endpoints, action tokens, or UI state.

`MAILPIT_API_URL` is an optional command-only override for the Mailpit API and defaults to `http://localhost:8025/api/v1` for host-run development.
