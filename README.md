# Notif Portal — Multi-Project FCM Notification Portal

A self-hosted control plane for sending, scheduling, and templating **Firebase
Cloud Messaging (FCM)** push notifications across **many independent Firebase
projects** from a single dashboard. Think a mini self-hosted OneSignal/Braze.

The defining feature: **each managed project has its own Firebase service-account
JSON**, stored **encrypted at rest**. The portal loads the correct credential per
campaign and initializes a **named `firebase-admin` app per project**, so tokens
and topics from one Firebase project are never mixed with another.

> **Status:** Phase 1 complete — monorepo scaffold, Prisma schema, encrypted
> `Project` CRUD + credential validation, named-app Firebase bootstrap,
> topic broadcast, and send-now. The device-token registry, segments, BullMQ
> scheduler, batched multicast, stale-token pruning, templates, and dashboard
> pages for the later phases are also wired up and usable via the mock sender.

## Architecture

```
notif-portal/
  apps/
    web/          # Next.js dashboard (App Router + Tailwind)
    api/          # Fastify REST API (producer of send jobs)
    worker/       # BullMQ scheduler + sender (consumer)
  packages/
    db/           # Prisma schema + client + seed
    domain/       # business logic: crypto, fcm, projects, campaigns, segments, templates
    contracts/    # shared zod types + queue job types
    config/       # env loading/validation (zod)
    logger/       # shared pino logger
```

### Core mental model

1. **Firebase project = one app.** Each has its own service account and device tokens. Never cross them.
2. **Portal = control plane.** It stores N encrypted service accounts (in the DB, **not** in `.env`) and loads the right one per campaign.
3. **`firebase-admin` requires a NAMED app per Firebase project** to run multiple projects in one process. The senders cache these apps keyed by the portal project id (`packages/domain/src/fcm/firebase.ts`).

### Delivery methods (chosen per campaign)

- **Topic broadcast** (`BROADCAST_TOPIC`) — send one message to a topic; no token DB required.
- **Token registry** (`SEGMENT` / `SPECIFIC_TOKENS`) — send to specific tokens in batches of up to 500 via `sendEachForMulticast()`. Stale tokens (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`) are pruned automatically.

### Mock vs. real FCM

All sending goes through the `FcmSender` interface. Set `FCM_DRIVER=mock`
(default) to run the **entire flow without real credentials** — great for local
dev and tests. Set `FCM_DRIVER=firebase` to send for real. In mock mode:

- Tokens starting with `stale-` simulate an unregistered token (and get pruned).
- Tokens starting with `fail-` simulate a generic delivery failure.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm i -g pnpm` or `corepack enable`)
- Docker (for Postgres + Redis) — or your own Postgres/Redis

> **Ports:** Postgres is published on `5432` and Redis on **`6380`** (host) to
> avoid clashing with a Redis you may already run on `6379`. `REDIS_URL` in
> `.env.example` already points at `6380`.

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Create your .env from the example, then generate a real encryption key
cp .env.example .env
node -e "console.log('PORTAL_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
# paste the printed value into .env

# 4. Generate the Prisma client and run migrations
pnpm db:generate
pnpm db:migrate      # creates the schema (name the migration e.g. "init")

# 5. Seed two demo projects (uses the mock FCM driver)
pnpm db:seed

# 6. Run everything (web + api + worker) in dev
pnpm dev
```

Then open:

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/health

> The root `.env` is auto-loaded by every app (`packages/config`). Each app also
> ships its own `.env.example` documenting the variables it needs.

## How to add a Firebase project

1. In the Firebase console: **Project settings → Service accounts → Generate new private key**. This downloads a JSON file.
2. In the dashboard, click **Add project**, paste the JSON, and hit **Test credentials**.
   - With `FCM_DRIVER=firebase`, this actually mints an access token to prove the credentials work.
   - With `FCM_DRIVER=mock`, structural validation is performed by zod.
3. Save. The JSON is encrypted with AES-256-GCM before it touches the database. The API only ever returns a **masked fingerprint** (e.g. `a1b2c3d4…f9e8`) — never the raw credential.

## How to register a device token

Client apps call the registration endpoint (also available on the **Device
Tokens** dashboard page):

```bash
curl -X POST http://localhost:4000/projects/<PROJECT_ID>/tokens \
  -H 'Content-Type: application/json' \
  -d '{ "token": "fcm-device-token", "platform": "ANDROID", "locale": "en-US", "topics": ["all-users"] }'
```

## How to send a campaign

Via the dashboard **New Campaign** page: pick audience (topic / segment / token
list), write content, preview, optionally **send a test**, then **Send now** or
**Schedule**.

Via the API:

```bash
# Topic broadcast, send immediately
curl -X POST http://localhost:4000/projects/<PROJECT_ID>/campaigns \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "send_now",
    "mode": "BROADCAST_TOPIC",
    "targetTopic": "all-users",
    "title": "Hello world",
    "body": "First multi-project push!"
  }'
```

`send_now` enqueues a BullMQ job (`campaign-<id>`); the **worker** picks it up,
loads the right named Firebase app, sends, updates `sentCount`/`failedCount`,
prunes stale tokens, and sets a terminal status. Scheduled campaigns are promoted
to `QUEUED` by the worker's repeatable scheduler (every 30s).

### Proving multi-project isolation

The seed creates two projects (`acme-sports`, `nimbus-weather`) each with its own
(fake) service account. Send a broadcast from each in the dashboard and watch the
worker logs — each send initializes and uses a **distinct named app** for a
**distinct FCM project id**, demonstrating one portal driving two Firebase
projects.

## API surface

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/projects` | List projects (masked credentials) |
| `POST` | `/projects` | Create project (validates + encrypts credential) |
| `GET` | `/projects/:id` | Get one project |
| `PATCH` | `/projects/:id` | Update project (name, topic, status, rotate credential) |
| `POST` | `/projects/:id/test-credentials` | Validate a service account |
| `POST` | `/projects/test-credentials` | Validate a service account (no id) |
| `GET/POST` | `/projects/:id/tokens` | List / register device tokens |
| `DELETE` | `/projects/:id/tokens/:token` | Remove a token |
| `GET/POST/PATCH/DELETE` | `/projects/:id/segments...` | Segment CRUD |
| `POST` | `/projects/:id/segments/estimate` | Estimate audience size |
| `GET/POST/PATCH/DELETE` | `/templates...` | Template CRUD |
| `POST` | `/projects/:id/campaigns` | Create draft / schedule / send-now |
| `GET` | `/campaigns` `/campaigns/:id` | List / get campaigns |
| `POST` | `/campaigns/:id/cancel` | Cancel a campaign |
| `POST` | `/projects/:id/campaigns/test` | Send to a single test token |

## Security notes

- Service-account JSON is **encrypted at rest** (AES-256-GCM, `packages/domain/src/crypto.ts`) using `PORTAL_ENCRYPTION_KEY`. It is **never logged** (pino redaction) and **never returned** by the API (only a masked SHA-256 fingerprint).
- All API input and all env vars are validated with **zod**.
- Every query is **scoped by `projectId`**, enforcing multi-project isolation at the data layer.

## Useful scripts

```bash
pnpm dev            # run web + api + worker
pnpm build          # build all apps/packages
pnpm typecheck      # typecheck everything
pnpm db:migrate     # prisma migrate dev
pnpm db:seed        # seed demo data
pnpm db:studio      # open Prisma Studio
```

## Roadmap

- **Phase 1 (done):** scaffold, encrypted project CRUD + validation, named-app bootstrap, topic broadcast, send-now.
- **Phase 2:** device-token registry, segments, BullMQ scheduler + scheduled sends, batched multicast + stale-token pruning. *(implemented; hardening ongoing)*
- **Phase 3:** templates with variable substitution, test sends, richer analytics UI.
- **Phase 4:** frequency capping, quiet hours, per-user timezone send, A/B split, roles/auth.
```
