# Local Docker Runbook

This project is local-first. Docker is used first for local infrastructure, then the React and Express apps can be added to Compose after they are scaffolded.

## Current Docker Services

| Service  | Purpose                                                                                                   | Host URL / Port                                     |
| -------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| postgres | Local PostgreSQL database for Prisma and backend integration tests                                        | `localhost:5432`                                    |
| mailpit  | Local SMTP catcher for the mail proof and M11B email-verification flow; it never relays to public inboxes | UI: `http://localhost:8025`, SMTP: `localhost:1025` |

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
PUBLIC_APP_URL="http://localhost:5173"
ACCOUNT_ACTION_RATE_LIMIT_SECRET="replace-with-a-long-local-secret"
```

If the backend later runs inside Docker Compose, use the `mailpit` service hostname:

```env
SMTP_HOST="mailpit"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_FROM="noreply@cloneinsta.local"
PUBLIC_APP_URL="http://localhost:5173"
ACCOUNT_ACTION_RATE_LIMIT_SECRET="replace-with-a-long-local-secret"
```

`PUBLIC_APP_URL` is the trusted base URL for verification links; it is not derived from an incoming `Host` header. The local default is `http://localhost:5173`; production must use an HTTPS URL. `ACCOUNT_ACTION_RATE_LIMIT_SECRET` must be at least 32 characters and is used only to HMAC email/IP rate-limit fingerprints before they are stored. Keep its real value in the ignored `server/.env`, never in documentation or source control.

## Prove Local SMTP Delivery

After Mailpit is running, execute:

```bash
npm run mail:verify --workspace server
```

The command sends a safe fixed test message through the configured SMTP boundary and polls Mailpit's local API for the exact subject. It prints `Mailpit SMTP delivery proof passed.` only after Mailpit receives that message. It proves the SMTP boundary only; it does not exercise an application registration or email-verification token.

`MAILPIT_API_URL` is an optional command-only override for the Mailpit API and defaults to `http://localhost:8025/api/v1` for host-run development.

## Exercise M11B Email Verification Locally

M11B adds backend email verification only. There is no browser confirmation page yet, so Mailpit is used to inspect the local message and Postman (or an equivalent HTTP client) confirms the token.

1. Start infrastructure, apply migrations, and run the server:

   ```bash
   docker compose up -d postgres mailpit
   npm run db:migrate:dev
   npm run dev:server
   ```

2. Send `POST http://localhost:3001/api/v1/auth/register` with the normal registration body. A successful `201` returns a safe user DTO with `status: "PENDING_VERIFICATION"` and `emailVerifiedAt: null`; it does not issue an access token or refresh cookie.
3. Open `http://localhost:8025`, open the **Verify your CloneInsta email** message, and copy the `token` query parameter from its link. The link target is `${PUBLIC_APP_URL}/verify-email?token=...`; it is expected to have no UI in M11B.
4. Send `POST http://localhost:3001/api/v1/auth/email-verification/confirm` with:

   ```json
   { "token": "copied-token" }
   ```

   A `200` returns the safe user DTO with `status: "ACTIVE"` and `emailVerifiedAt`. Login can now succeed.

5. To replace a lost or expired local message, send `POST http://localhost:3001/api/v1/auth/email-verification/request` with `{ "email": "the-registered-email@example.test" }`. It always returns the same `202` message for a matching pending address, an unknown address, or an already-active address, so it does not reveal account existence.

### M11B Security and Rate Limits

- Registration creates a 32-random-byte verification token that expires after 24 hours. Only its SHA-256 hash is stored; raw tokens and verification URLs must not appear in logs, audits, or API DTOs.
- Requesting a replacement consumes prior unused verification tokens for that user. Confirmation consumes the selected valid token and changes the account from `PENDING_VERIFICATION` to `ACTIVE` in one transaction, so a token cannot be reused.
- Requests are limited to 3 per 15 minutes per HMAC-hashed email and IP. Confirmation attempts are limited to 10 per 15 minutes per HMAC-hashed IP. Exceeding either limit returns `429 AUTH_EMAIL_VERIFICATION_RATE_LIMITED`.
- Invalid, expired, or already-consumed tokens return `400 AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED`. Pending-account login remains the generic `401 AUTH_INVALID_CREDENTIALS` response.
- Mailpit is local-only. Do not use it to test delivery to `@gmail.com` or any public address; real public delivery needs a separately approved transactional provider and credentials.
